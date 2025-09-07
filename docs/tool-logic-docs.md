# Image Editing Tools Logic Documentation

This document outlines the core logic and functioning of each image editing tool component in the DynaImg application. It focuses exclusively on the algorithmic and data processing aspects, excluding any UI/UX details.

## BrightnessTool

### Functioning
Adjusts the brightness of the image by uniformly adding or subtracting a value from each red, green, and blue color channel.

### Core Logic
- Captures original image data as baseline.
- Calculates brightness adjustment value: `brightnessValue = clamped(-100..100) * 255 / 100`.
- Iterates over each pixel's RGBA values:
  - `newR/G/B = oldR/G/B + brightnessValue`
  - Clamps result to 0-255 using Math.max(0, Math.min(255, value)).
- Applies modified pixel data to canvas.
- Re-baselines original data on interaction start/end for smooth adjustments.

## ContrastTool

### Functioning
Modifies image contrast using a mathematical formula to stretch or compress tonal range around the midpoint (128).

### Core Logic
- Retrieves original image data.
- Computes contrast factor: `factor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue))` where contrastValue ranges from -100 to 100.
- Applies factor to each pixel:
  - `newR/G/B = factor * (oldR/G/B - 128) + 128`
  - Clamps to 0-255.
- Updates canvas with adjusted data.
- Handles baseline capture for real-time interaction.

## FiltersTool

### Functioning
Applies predefined color transformations (grayscale, negative, sepia) or resets to original state.

### Core Logic
- Stores thumbnail and original image data.
- On filter application:
  - Grayscale: Converts to luminance using `Y = 0.299*R + 0.587*G + 0.114*B`, sets R=G=B=Y.
  - Negative: Inverts each channel (`new = 255 - old`).
  - Sepia: Applies matrix: `newR = 0.393*R + 0.769*G + 0.189*B`, similar for G and B.
- Clamps results to 0-255.
- Reset filter restores original data.
- Reacts to external canvas changes to update thumbnail and re-base original.

## HistogramTool

### Functioning
Computes and visualizes pixel value distributions for red, green, blue channels and luma (brightness).

### Core Logic
- Counts occurrences of each pixel intensity value (0-255) for R, G, B.
- Computes luma histogram: `Y = 0.2126*R + 0.7152*G + 0.0722*B`.
- Uses Plotly.js to render overlaid bar charts and line plot for luma.
- Updates histograms on image state changes (imageVersion).

## HueTool

### Functioning
Adjusts the hue (color tone) of the image while preserving saturation and lightness.

### Core Logic
- Converts RGB to HSL space using standard formulas.
- Shifts hue component: `newH = (H + hueShift) % 360` where hueShift is derived from input (-180..180 degrees) normalized to 0-1.
- Converts back to RGB.
- Clamps RGB to 0-255.
- Applies to all pixels, updates canvas.
- Tracks baseline for interaction-based adjustments.

## RotateTool

### Functioning
Rotates the entire image 90 degrees clockwise or counterclockwise around center.

### Core Logic
- Creates offscreen canvas matching original size.
- Copies original to offscreen canvas.
- Adjusts main canvas size: newH = oldW, newW = oldH.
- Translates context to new center, rotates by ±90 degrees.
- Draws offscreen canvas onto rotated context.
- Updates canvasEditor context and puts modified image data.
- Bumps imageVersion to notify other tools of change.

## SaturationTool

### Functioning
Modifies color saturation (intensity) while keeping hue and lightness intact.

### Core Logic
- Converts pixels to HSL.
- Adjusts saturation linearly: `newS = S + satAdj * (1 - Math.abs(S))` where satAdj ranges from -1 to 1 (scaled from -100..100%).
- Clamps newS to 0-1.
- Converts back to RGB, clamped.
- Applies across image.
- Manages original baseline for smooth slider interactions.

## TintTool

### Functioning
Applies a color tint by blending original pixel colors with a selected tint color based on strength.

### Core Logic
- Converts tint hex color to RGB ({r, g, b}).
- Computes alpha from strength: `a = clamped(0..100) / 100`.
- For each pixel: `newR/G/B = Math.round((1 - a) * oldR/G/B + a * tintR/G/B)`.
- Supports color selection via hex picker.
- Maintains tool-start baseline for full reset to pre-tint state.
- Handles interaction baselines for real-time updates.