use tauri::{AppHandle, Manager, Emitter, command};
use tauri::Wry;
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread_local;
use std::cell::RefCell;
use once_cell::sync::Lazy;
use windows::{
    core::*,
    Win32::Foundation::*,
    Win32::UI::Input::*,
    Win32::UI::WindowsAndMessaging::*
};

#[derive(Debug, Clone, Serialize)]
pub enum DeviceEventKind {
    MousePress,
    MouseRelease,
    MouseMove,
    KeyboardPress,
    KeyboardRelease,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceEvent {
    kind: DeviceEventKind,
    value: Value,
}

static IS_LISTENING: AtomicBool = AtomicBool::new(false);

static APP_HANDLE: Lazy<Mutex<Option<AppHandle<Wry>>>> = Lazy::new(|| Mutex::new(None));

static MOUSE_POSITION: Mutex<(i32, i32)> = Mutex::new((0, 0));

thread_local! {
    static HOOK_HANDLE: RefCell<Option<HHOOK>> = RefCell::new(None);
}

#[command]
pub async fn start_raw_input(app: AppHandle<Wry>) -> std::result::Result<(), String> {
    if IS_LISTENING.load(Ordering::SeqCst) {
        return Ok(());
    }

    IS_LISTENING.store(true, Ordering::SeqCst);
    
    unsafe {
        *APP_HANDLE.lock().unwrap() = Some(app.clone());
        setup_raw_input(&app).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

unsafe extern "system" fn window_hook_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code >= 0 {
        let msg = unsafe { &*(lparam.0 as *const MSG) };
        
        if msg.message == WM_INPUT {
            if let Ok(guard) = APP_HANDLE.lock() {
                if let Some(app) = guard.as_ref() {
                    unsafe { handle_raw_input(msg.lParam, app) };
                }
            }
        }
    }
    
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

unsafe fn setup_raw_input(app: &AppHandle<Wry>) -> Result<()> {
    // Get window handle from Tauri
    let window = app.get_webview_window("main")
                                      .ok_or_else(|| Error::new(E_FAIL, "Window not found"))?;

    let raw_handle = window.hwnd()
        .map_err(|e| Error::new(E_FAIL, e.to_string()))?;
    let hwnd = HWND(raw_handle.0);

    // Register for mouse raw input
    let device = RAWINPUTDEVICE {
        usUsagePage: 0x01,
        usUsage: 0x02,
        dwFlags: RIDEV_INPUTSINK,
        hwndTarget: hwnd,
    };

    unsafe { RegisterRawInputDevices(&[device], std::mem::size_of::<RAWINPUTDEVICE>() as u32) }?;

    // Install Windows hook
    let hhook = unsafe { SetWindowsHookExW(WH_GETMESSAGE, Some(window_hook_proc), None, GetWindowThreadProcessId(hwnd, None)) }?;

    // Store the hook handle
    HOOK_HANDLE.with(|h| {
        *h.borrow_mut() = Some(hhook);
    });

    Ok(())
}

unsafe fn handle_raw_input(lparam: LPARAM, app: &AppHandle<Wry>) {

    let mut size = 0u32;
    unsafe { GetRawInputData(
        HRAWINPUT(lparam.0 as _),
        RID_INPUT,
        None,
        &mut size,
        std::mem::size_of::<RAWINPUTHEADER>() as u32,
    ) };

    let mut buffer = vec![0u8; size as usize];
    unsafe { GetRawInputData(
        HRAWINPUT(lparam.0 as _),
        RID_INPUT,
        Some(buffer.as_mut_ptr() as *mut _),
        &mut size,
        std::mem::size_of::<RAWINPUTHEADER>() as u32,
    ) };

    let raw = unsafe { &*(buffer.as_ptr() as *const RAWINPUT) };
    
    if raw.header.dwType == RIM_TYPEMOUSE.0 {
        let mouse = unsafe { raw.data.mouse };
        let delta_x = mouse.lLastX;
        let delta_y = mouse.lLastY;

        // Update accumulated position
        let mut pos = MOUSE_POSITION.lock().unwrap();
        pos.0 += delta_x;
        pos.1 += delta_y;

        if pos.0 < 0 { pos.0 = 0; }
        if pos.0 > 3000 { pos.0 = 3000; }

        if pos.1 < 0 { pos.1 = 0; }
        if pos.1 > 1500 { pos.1 = 1500; }

        let device_event = DeviceEvent {
            kind: DeviceEventKind::MouseMove,
            value: json!({ "x": pos.0, "y": pos.1 }), 
        };
        
        //println!("Mouse Move Event: x={}, y={}", pos.0, pos.1);

        // Emit to frontend
        let _ = app.emit("device-changed", device_event);
    }
}