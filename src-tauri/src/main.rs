#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Workaround for WebKitGTK Wayland protocol error (Error 71)
    // when using transparent windows on certain Wayland compositors.
    #[cfg(target_os = "linux")]
    // SAFETY: Called before any other threads are spawned in main().
    unsafe { std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1") };

    bongo_cat_lib::run()
}