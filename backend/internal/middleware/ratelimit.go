package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimitConfig configures a per-key token-bucket rate limiter.
//
// Requests are tagged by KeyFunc (typically the client IP). Each key gets a
// bucket of Burst tokens that refills at RatePerSecond. When the bucket is
// empty the request is rejected with 429.
type RateLimitConfig struct {
	// RatePerSecond is the steady-state refill rate.
	RatePerSecond float64
	// Burst is the maximum bucket size (and the number of requests allowed
	// in a sudden spike).
	Burst int
	// KeyFunc derives the bucket key from the request. Defaults to ClientIP.
	KeyFunc func(*gin.Context) string
}

type bucket struct {
	tokens float64
	last   time.Time
}

type rateLimiter struct {
	cfg     RateLimitConfig
	mu      sync.Mutex
	buckets map[string]*bucket
}

// RateLimit returns a Gin middleware enforcing the given config.
//
// Buckets are kept in process memory; that is intentional for a single
// container instance. Once we run multi-replica we will swap this for a
// Redis-backed limiter, but the contract (429 + Retry-After) stays the same.
func RateLimit(cfg RateLimitConfig) gin.HandlerFunc {
	if cfg.RatePerSecond <= 0 {
		cfg.RatePerSecond = 1
	}
	if cfg.Burst <= 0 {
		cfg.Burst = 5
	}
	if cfg.KeyFunc == nil {
		cfg.KeyFunc = func(c *gin.Context) string { return c.ClientIP() }
	}

	rl := &rateLimiter{cfg: cfg, buckets: make(map[string]*bucket)}

	// Periodically evict idle buckets so memory does not grow unbounded
	// under churn (e.g. a botnet probing many IPs).
	go rl.gc()

	return func(c *gin.Context) {
		key := cfg.KeyFunc(c)
		if !rl.allow(key) {
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok {
		rl.buckets[key] = &bucket{tokens: float64(rl.cfg.Burst) - 1, last: now}
		return true
	}

	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * rl.cfg.RatePerSecond
	if b.tokens > float64(rl.cfg.Burst) {
		b.tokens = float64(rl.cfg.Burst)
	}
	b.last = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (rl *rateLimiter) gc() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-15 * time.Minute)
		for k, b := range rl.buckets {
			if b.last.Before(cutoff) {
				delete(rl.buckets, k)
			}
		}
		rl.mu.Unlock()
	}
}
