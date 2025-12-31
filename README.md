# Time-Frequency Analysis (STFT)

An interactive visualization tool for exploring Time-Frequency analysis, Spectrograms, and various types of signal transforms.

## Overview

This application visualizes how the frequency content of a signal evolves over time, utilizing the **Short-Time Fourier Transform (STFT)** and other advanced time-frequency distributions. Unlike the standard Fourier Transform which provides global frequency information, these methods reveal local frequency dynamics, making them essential for analyzing non-stationary signals.

## Features

-   **Signal Construction**: Craft complex signals by mixing multiple wave components (Sine, Square, Triangle, Sawtooth).
-   **Envelopes**: Shape the amplitude of each component over time using Gaussian, ADSR, or Square envelopes.
-   **Interactive Spectrogram**: A real-time heatmap visualization (Time vs. Frequency vs. Magnitude) with zoom and pan capabilities.
-   **Advanced Transforms**:
    -   **Gabor (Standard STFT)**: Uses a fixed Gaussian window.
    -   **Double Gabor**: Multiplies two Gabor transforms with different window widths to sharpen joint localization.
    -   **Wavelet (Approximated)**: Simulate multi-resolution analysis using wide windows for low frequencies and narrow windows for high frequencies.
    -   **Wigner-Ville**: High-resolution distribution (Pseudo Wigner-Ville) that minimizes blurring but may introduce interference terms.
    -   **Chirplet**: Extends Gabor with a "chirp" parameter to rotate the time-frequency tiling, ideal for sweeping signals.
-   **Window Functions**: Switch between Gaussian (smooth, low leakage) and Square (sharp time, high leakage) windows.
-   **Audio Playback**: Listen to your generated signal with adjustable frequency modulation.

## Development

**Vibe Coded** with ❤️
