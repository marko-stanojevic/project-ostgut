# 🎛️ Station Tagging Strategy

## 🧠 Purpose

Define a consistent, expressive, and scalable tagging system for radio stations that enables:

- clear categorization  
- strong discovery & filtering  
- consistent metadata across all stations  
- a coherent editorial identity  

---

## 🧱 Core Principles

- **Clarity over cleverness**  
- **No overlapping dimensions**  
- **Strict where needed, flexible where valuable**  
- **Editorial, not overly technical**  
- **Designed for consistency across systems and contributors**  

---

## 📦 Data Model

{
  "genre": [],
  "subgenre": [],
  "style": [],
  "format": [],
  "texture": []
}

---

## 🎧 Genre (REQUIRED)

### Definition  

High-level musical identity.

### Rules

- Mandatory (at least 1 value)  
- Open vocabulary  
- Should represent broad musical domain  

### Examples

- electronic  
- jazz  
- hip-hop  
- indie  
- rock  
- global  
- eclectic  

---

## 🎯 Subgenre (aka “Sound”) (OPTIONAL)

### Definition  

Precise musical classification and scene-specific identity.

### Rules

- Optional  
- Open vocabulary (normalized: lowercase, consistent naming)  
- 1–4 values recommended  
- Must NOT duplicate Genre  

### Examples

- dub techno  
- deep house  
- ambient  
- italo disco  
- tribal house  
- breakbeat  

---

## 🖤 Style (OPTIONAL, CONTROLLED)

### Definition  

Intent, curation approach, and cultural positioning.

### Allowed Values

- curated  
- editorial  
- underground  
- independent  
- community  
- cultural  
- experimental  

### Rules

- Use only defined values  
- 2–4 values recommended  
- Avoid overlapping meanings  

---

## 🌊 Format (OPTIONAL, STRICT / CLOSED)

### Definition  

How the station is structured and delivered over time.

### Allowed Values (FIXED)

- hosted  
- automated  
- continuous  
- scheduled  
- freeform  
- session  

### Rules

- Closed vocabulary (no additions allowed)  
- 1–3 values recommended  
- Do NOT create new values or aliases  

### Definitions

- **hosted** → human DJ / presenter involved  
- **automated** → no real-time human presence  
- **continuous** → uninterrupted stream  
- **scheduled** → structured programming grid  
- **freeform** → no strict programming rules  
- **session** → live or recorded performance sets  

---

## ✨ Texture (OPTIONAL, CONTROLLED)

### Definition  

Perceptual and sonic qualities of the sound.

### Allowed Values

- smooth  
- raw  
- dense  
- minimal  
- warm  
- gritty  
- bright  
- spacious  
- dark  
- deep  
- lo-fi  

### Rules

- 2–3 values recommended  
- Must describe *feel*, not genre or structure  
- Avoid subjective or emotional terms  

---

## 🧠 Tagging Rules (General)

- Always include **at least 1 Genre**  
- Prefer **precision over coverage**  
- Avoid over-tagging  
- Do not invent new values in controlled categories  
- Keep output consistent and normalized  

---

## 🧪 Example

### Dub Techno Station

{
  "genre": ["electronic"],
  "subgenre": ["dub techno"],
  "style": ["curated", "underground"],
  "format": ["automated", "continuous"],
  "texture": ["deep", "spacious", "minimal"]
}

---

## 🎯 Design Philosophy

| Dimension | Purpose |
|----------|--------|
| Genre | What it is |
| Subgenre | Precision |
| Style | Intent and positioning |
| Format | Structure |
| Texture | Perceptual feel |

---

## 🚫 Anti-Patterns

Avoid:

- Using texture as genre (e.g. "ambient" as texture)  
- Creating new format values  
- Overlapping tags across dimensions  
- Over-tagging everything  
- Using subjective descriptors (e.g. "emotional", "uplifting")  
