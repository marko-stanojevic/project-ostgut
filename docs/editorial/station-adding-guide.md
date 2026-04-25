# 🎛️ Station Adding Guide

## 🧠 Purpose

Define a consistent process for adding new radio stations, ensuring:

- high-quality metadata  
- reliable streaming  
- consistent tagging  
- strong editorial presentation  

This guide applies to all stations regardless of how they are added.

---

# 🧱 Core Principles

- **Clarity over cleverness**  
- **No overlapping dimensions**  
- **Strict where needed, flexible where valuable**  
- **Editorial, not overly technical**  
- **Consistency across all stations**  

---

# 📦 Station Structure

Each station should follow this structure:

    {
      "name": "",
      "about": "",
      "editorial_review": "",
      "streams": [],
      "tags": {
        "genre": [],
        "subgenre": [],
        "style": [],
        "format": [],
        "texture": []
      },
      "icon": ""
    }

---

# 📝 Text Fields

## About

### Definition  

`about` provides a clear, factual overview of the station.

### Rules

- 3–5 sentences  
- concise and informative  
- no hype or marketing language  
- should explain:
  - what the station is  
  - where it is based (if relevant)  
  - what music or programming defines it  

---

## Editorial Review

### Definition  

`editorial_review` adds a more personal and atmospheric perspective.

### Rules

- more expressive than `about`  
- focuses on:
  - music  
  - curation  
  - feel  
  - ambience  
- avoid clichés and generic praise  
- tone should be refined and intentional  

---

# 🎧 Streams

## 🔢 Number of Streams

- 1–4 stream URLs per station  

---

## 🏆 Priority

Each stream must include a `priority`:

- `0` → highest quality  
- `1`  
- `2`  
- `3` → lowest quality  

### Rules

- unique per stream  
- sequential starting from `0`  
- max 4 streams  

---

## 🎚️ Quality Ordering

Streams must be ordered:

> best → worst quality  

### Format priority

1. Lossless / Hi-Res (FLAC, WAV)  
2. AAC  
3. MP3  

---

## 🔗 Stream Type Preference

For equal quality:

Prefer:

- `.pls`  
- `.m3u`  
- `.m3u8`  

Avoid direct URLs unless necessary.

---

## ⚠️ Validation

- no duplicate URLs  
- no duplicate priorities  
- all streams must be reachable  

---

## 🔄 Health Checks

Stream health is handled automatically:

- streams are periodically validated  
- failures trigger fallback to next priority  
- recovery is automatic  

No manual configuration required.

---

## 🧪 Example

    "streams": [
      { "url": "https://example.com/stream.flac.m3u", "priority": 0 },
      { "url": "https://example.com/stream.aac.m3u", "priority": 1 },
      { "url": "https://example.com/stream.mp3", "priority": 2 }
    ]

---

# 🏷️ Tags

Follow the tagging strategy defined in [station-tagging-strategy.md](station-tagging-strategy.md).

---

# 🖼️ Station Icon

## Requirements

- high quality  
- square (1:1) preferred  
- clear at small sizes  

---

## Processing

- automatically resized into multiple sizes  
- optimized for UI layers  

---

## Guidelines

- avoid low resolution  
- avoid heavy compression  
- keep design simple  

---

# 🎯 Quality Checklist

Before adding a station:

- [ ] Name is correct  
- [ ] About is clear and factual  
- [ ] Editorial review adds meaningful perspective  
- [ ] Streams are valid and prioritized correctly  
- [ ] Tags follow taxonomy rules  
- [ ] Icon is high quality  

---

# 🚫 Anti-Patterns

Avoid:

- over-tagging  
- using texture as genre  
- inventing new format values  
- vague or generic descriptions  
- broken or duplicate streams  

---

# 🏁 Summary

A good station entry is:

- technically reliable  
- clearly described  
- consistently tagged  
- editorially distinct  
- visually recognizable  
