// Package handler contains HTTP request handlers for the API.
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthResponse is the JSON body returned by the health endpoint.
type HealthResponse struct {
	Status string `json:"status"`
}

// Health returns a 200 OK with status "ok" — used by the ACA liveness probe.
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, HealthResponse{Status: "ok"})
}
