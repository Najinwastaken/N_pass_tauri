//! Window geometry: adaptive size on the first run, remembered afterwards.
//!
//! First run (no state file): the window takes ~80% of the current
//! monitor's logical size, clamped between 900x600 and 1500x850, centered.
//! Every close saves size/position/maximized into `window-state.json`
//! next to the executable (same portable philosophy as `vaults/`).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{LogicalSize, PhysicalPosition, Runtime, WebviewWindow, Window};

const MIN_W: f64 = 900.0;
const MIN_H: f64 = 600.0;
const MAX_W: f64 = 1500.0;
const MAX_H: f64 = 850.0;
const SCREEN_FRACTION: f64 = 0.8;

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
struct WindowState {
    /// Logical (DPI-independent) size.
    width: f64,
    height: f64,
    /// Physical outer position.
    x: i32,
    y: i32,
    maximized: bool,
}

fn state_path() -> Option<PathBuf> {
    Some(
        std::env::current_exe()
            .ok()?
            .parent()?
            .join("window-state.json"),
    )
}

fn load() -> Option<WindowState> {
    serde_json::from_str(&std::fs::read_to_string(state_path()?).ok()?).ok()
}

/// Apply the remembered geometry, or compute an adaptive default relative
/// to the monitor the window opened on.
pub fn restore_or_default<R: Runtime>(window: &WebviewWindow<R>) {
    if let Some(state) = load() {
        let _ = window.set_size(LogicalSize::new(
            state.width.clamp(MIN_W, 10_000.0),
            state.height.clamp(MIN_H, 10_000.0),
        ));
        // Only reuse the position if it is still on some monitor
        // (the display setup may have changed since last run).
        let visible = window
            .available_monitors()
            .map(|monitors| {
                monitors.iter().any(|m| {
                    let pos = m.position();
                    let size = m.size();
                    state.x >= pos.x - 50
                        && state.y >= pos.y - 50
                        && state.x < pos.x + size.width as i32
                        && state.y < pos.y + size.height as i32
                })
            })
            .unwrap_or(false);
        if visible {
            let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
        } else {
            let _ = window.center();
        }
        if state.maximized {
            let _ = window.maximize();
        }
        return;
    }

    // First run: size relative to the monitor's logical work space.
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale = monitor.scale_factor();
        let logical_w = monitor.size().width as f64 / scale;
        let logical_h = monitor.size().height as f64 / scale;
        let width = (logical_w * SCREEN_FRACTION).clamp(MIN_W, MAX_W);
        let height = (logical_h * SCREEN_FRACTION).clamp(MIN_H, MAX_H);
        let _ = window.set_size(LogicalSize::new(width, height));
    }
    let _ = window.center();
}

/// Forget the remembered geometry and go back to the adaptive default
/// (Settings -> Reset window).
pub fn reset<R: Runtime>(window: &WebviewWindow<R>) {
    if let Some(path) = state_path() {
        let _ = std::fs::remove_file(path);
    }
    let _ = window.unmaximize();
    restore_or_default(window);
}

/// Persist current geometry (called on close). When the window is
/// maximized, only the flag is updated so the remembered "restored" size
/// survives maximize/close cycles.
pub fn save<R: Runtime>(window: &Window<R>) {
    let Some(path) = state_path() else { return };
    let maximized = window.is_maximized().unwrap_or(false);

    let state = if maximized {
        let mut prev = load().unwrap_or(WindowState {
            width: 1400.0,
            height: 800.0,
            x: 0,
            y: 0,
            maximized: false,
        });
        prev.maximized = true;
        prev
    } else {
        let scale = window.scale_factor().unwrap_or(1.0);
        let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) else {
            return;
        };
        WindowState {
            width: size.width as f64 / scale,
            height: size.height as f64 / scale,
            x: pos.x,
            y: pos.y,
            maximized: false,
        }
    };

    if let Ok(json) = serde_json::to_string_pretty(&state) {
        let _ = std::fs::write(path, json);
    }
}
