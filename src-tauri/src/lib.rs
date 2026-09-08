mod commands;
mod rewrite;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init());

  // Mise a jour et redemarrage : le bureau seulement. Sur telephone, c'est le
  // magasin qui livre les versions, et les deux greffons n'y existent pas.
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build());

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::apply_pseudonymisation,
      commands::write_beside,
      commands::copy_to_dir,
      commands::projects_load,
      commands::projects_save,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
