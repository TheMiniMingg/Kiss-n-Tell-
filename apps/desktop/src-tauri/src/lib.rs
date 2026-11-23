mod packs;

use packs::{safe_file_name, unique_path, Store, MAX_EXPORT_BYTES};
use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State};

struct AppState {
    store: Store,
    trash: PathBuf,
}

fn raw_body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err("Expected raw bytes.".into()),
    }
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("Missing {name}."))
}

#[tauri::command]
fn packs_dir(state: State<'_, AppState>) -> String {
    state.store.root.to_string_lossy().into_owned()
}

#[tauri::command]
fn list_packs(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.store.list()
}

#[tauri::command]
fn list_pack_files(state: State<'_, AppState>, id: String) -> Result<Vec<String>, String> {
    state.store.files(&id)
}

#[tauri::command]
fn read_pack_file(state: State<'_, AppState>, id: String, path: String) -> Result<Response, String> {
    state.store.read(&id, &path).map(Response::new)
}

#[tauri::command]
fn begin_pack_save(state: State<'_, AppState>) -> Result<String, String> {
    state.store.begin()
}

/// Body: the file's bytes. Headers: x-token (from begin_pack_save) and x-path.
#[tauri::command]
fn write_pack_file(state: State<'_, AppState>, request: Request<'_>) -> Result<(), String> {
    let token = header(&request, "x-token")?;
    let path = header(&request, "x-path")?;
    state.store.write(token, path, raw_body(&request)?)
}

#[tauri::command]
fn commit_pack_save(state: State<'_, AppState>, token: String, id: String, replaces: Option<String>) -> Result<(), String> {
    state.store.commit(&token, &id, replaces.as_deref())
}

#[tauri::command]
fn cancel_pack_save(state: State<'_, AppState>, token: String) -> Result<(), String> {
    state.store.cancel(&token)
}

#[tauri::command]
fn delete_pack(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.store.delete(&id, &state.trash)
}

/// Save bytes (a pack ZIP or a share card) to the user's Downloads folder.
/// Body: the bytes. Header x-name: the suggested file name (sanitized here).
/// Returns the full path written.
#[tauri::command]
fn save_to_downloads(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let name = header(&request, "x-name")?;
    let data = raw_body(&request)?;
    if data.len() > MAX_EXPORT_BYTES {
        return Err("The file is too large to save.".into());
    }
    let ext = match name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()) {
        Some(e) if e == "zip" || e == "png" || e == "csv" => e,
        _ => return Err("Only .zip, .png and .csv files can be saved.".into()),
    };
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("Could not find your Downloads folder: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not open {}: {e}", dir.display()))?;
    let path = unique_path(&dir, &safe_file_name(name, &ext));
    std::fs::write(&path, data).map_err(|e| format!("Could not save {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Show the packs folder in the system file manager.
#[tauri::command]
fn open_packs_folder(state: State<'_, AppState>) -> Result<(), String> {
    let dir = &state.store.root;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open the folder: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            let store = Store::new(data.join("packs"));
            store.clean_leftovers();
            app.manage(AppState { store, trash: data.join("trash") });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            packs_dir,
            list_packs,
            list_pack_files,
            read_pack_file,
            begin_pack_save,
            write_pack_file,
            commit_pack_save,
            cancel_pack_save,
            delete_pack,
            save_to_downloads,
            open_packs_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kiss N Tell");
}
