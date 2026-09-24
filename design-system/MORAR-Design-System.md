# MORAR — Design System

## Purpose
Reference and implementation guide for an application designed to feel like a native digital extension of Morar Construtora e Incorporadora.

## 1. Visual DNA
- Institutional green + white.
- Real-estate photography as a major emotional element.
- Clean sans-serif typography.
- Strong but approachable headings.
- Spacious layouts and restrained decoration.
- Trust, proximity, quality of life and commercial clarity.

## 2. Color system

### Primary
- `#006B3F` — primary institutional green / main CTA.
- `#004F32` — dark green / hover and strong states.
- `#14915B` — lighter green / supporting emphasis.

### Surfaces
- `#FFFFFF` — primary background and cards.
- `#F8F9F8` — soft neutral background.
- `#F3FAF6` — soft green surface.

### Text
- `#252B27` — primary text.
- `#626A65` — secondary text.
- `#7B837E` — muted text.
- `#FFFFFF` — text on dark green.

### Border
- `#E5E8E6`.

### Status
- Success `#168653`
- Warning `#D69A24`
- Danger `#C94343`
- Info `#3478A8`

### Extended green scale
Recommended implementation scale, not a claim that every value is an official website token:
`#003D25`, `#004F32`, `#005D39`, `#006B3F`, `#087A4A`, `#14915B`, `#48AD7D`, `#82C7A5`, `#B9DFC9`, `#E5F3EB`, `#F3FAF6`.

## 3. Typography
The site's visual language is clearly sans-serif and contemporary. The exact CSS font-family was not reliably exposed through the textual inspection. For implementation, use:
- Headings/display: Montserrat, 600–700.
- Body/interface: Inter, 400–600.

Recommended scale (base font-size: 15px):
Display 48–56px; H1 36–44px; H2 28–32px; H3 22–26px; body 15px; body large 18px; body small 14px; caption 12px; buttons 14–16px.

## 4. Spacing
Use a 4px base system:
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px.

## 5. Radius
6px / 8px / 14px / 20px. Avoid rounding everything into pills.

## 6. Shadows
- Small: `0 2px 8px rgba(0,0,0,.06)`
- Medium: `0 8px 24px rgba(0,0,0,.08)`
Keep elevation subtle.

## 7. Components
Use the component rules in `components.md`.

## 8. Photography
Photography should dominate where property discovery is the goal. Use high-quality architecture, interiors, amenities, lifestyle and location imagery. Avoid generic stock imagery when authentic project photography is available.

## 9. Layout
Desktop max width 1200–1280px. Use 24px side padding. Typical property grids: 3 columns desktop, 2 tablet, 1 mobile.

## 10. Brand personality
Reliable, familiar, modern, premium without being ostentatious, minimalist, commercial but human.

## 11. Do / Don't
Do: white space, green accents, strong photography, clear hierarchy, restrained shadows, consistent icons.
Don't: neon, purple/blue dominance, heavy gradients, excessive glassmorphism, strong shadows, futuristic fonts, excessive animation, generic SaaS styling.

## 12. Implementation
Prefer `tokens.css` and `tokens.json` as machine-readable sources. Use this Markdown as the primary behavioral/design instruction set. Keep the PDF as visual/reference documentation.

## Evidence status
Observed direction: green/white identity, photographic real-estate presentation, clean hierarchy and navigation/content structure.
Recommended/inferred: exact extended color scale, Montserrat + Inter pairing, full spacing/radius/shadow tokens. Validate exact official values against the site's source CSS or brand manual before treating them as immutable brand standards.
