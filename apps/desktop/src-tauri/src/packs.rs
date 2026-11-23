//! Pack storage on disk. Every path that reaches the file system is built
//! here from a validated pack id and a path from a fixed allowlist, so the
//! webview can never read or write outside the packs folder.
//!
//! Layout (same as content/presets/<id>):
//!   <app data>/packs/<id>/topic.json
//!   <app data>/packs/<id>/questions.csv
//!   <app data>/packs/<id>/character/character.json
//!   <app data>/packs/<id>/character/00.webp .. 10.webp
//!
//! Saves are written to a staging folder first and swapped in at the end,
//! so a crash mid-save never leaves a half-written pack.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
pub const MAX_TEXT_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_EXPORT_BYTES: usize = 150 * 1024 * 1024;
const MAX_ID_LEN: usize = 64;
const STAGING: &str = ".staging";
const OLD: &str = ".old";
const IMAGE_EXTS: [&str; 5] = ["webp", "png", "jpg", "jpeg", "svg"];

/// Pack and topic ids: lowercase letters, digits, - and _, starting with a letter or digit.
pub fn valid_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => {}
        _ => return false,
    }
    id.len() <= MAX_ID_LEN && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// The only files a pack may contain. Mirrors isPackPath in src/pack/files.ts.
pub fn valid_pack_path(path: &str) -> bool {
    if path == "topic.json" || path == "questions.csv" || path == "character/character.json" {
        return true;
    }
    let Some(file) = path.strip_prefix("character/") else { return false };
    let Some((stem, ext)) = file.split_once('.') else { return false };
    stem.len() == 2
        && stem.chars().all(|c| c.is_ascii_digit())
        && stem.parse::<u32>().map(|n| n <= 10).unwrap_or(false)
        && IMAGE_EXTS.contains(&ext)
}

pub fn size_limit(path: &str) -> u64 {
    if path.ends_with(".json") || path.ends_with(".csv") {
        MAX_TEXT_BYTES
    } else {
        MAX_IMAGE_BYTES
    }
}

fn valid_token(token: &str) -> bool {
    !token.is_empty() && token.len() <= 40 && token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn rel(path: &str) -> PathBuf {
    path.split('/').collect()
}

fn io_err(what: &str, e: std::io::Error) -> String {
    format!("{what}: {e}")
}

pub struct Store {
    pub root: PathBuf,
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Store { root }
    }

    fn ensure_root(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(|e| io_err("Could not create the packs folder", e))
    }

    fn pack_dir(&self, id: &str) -> Result<PathBuf, String> {
        if !valid_id(id) {
            return Err(format!("\"{id}\" is not a valid pack id."));
        }
        Ok(self.root.join(id))
    }

    /// Pack folders that contain a topic.json, sorted by id.
    pub fn list(&self) -> Result<Vec<String>, String> {
        self.ensure_root()?;
        let mut ids = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(|e| io_err("Could not read the packs folder", e))? {
            let Ok(entry) = entry else { continue };
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
            if valid_id(&name) && entry.path().join("topic.json").is_file() {
                ids.push(name);
            }
        }
        ids.sort();
        Ok(ids)
    }

    /// The allowlisted files present in a pack.
    pub fn files(&self, id: &str) -> Result<Vec<String>, String> {
        let dir = self.pack_dir(id)?;
        let mut out = Vec::new();
        for (sub, prefix) in [(dir.clone(), ""), (dir.join("character"), "character/")] {
            let Ok(entries) = fs::read_dir(&sub) else { continue };
            for entry in entries.flatten() {
                let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
                let path = format!("{prefix}{name}");
                if valid_pack_path(&path) && entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    out.push(path);
                }
            }
        }
        out.sort();
        Ok(out)
    }

    pub fn read(&self, id: &str, path: &str) -> Result<Vec<u8>, String> {
        if !valid_pack_path(path) {
            return Err(format!("\"{path}\" is not a pack file."));
        }
        let full = self.pack_dir(id)?.join(rel(path));
        let file = fs::File::open(&full).map_err(|e| io_err(&format!("Could not open {path}"), e))?;
        let limit = size_limit(path);
        let len = file.metadata().map(|m| m.len()).unwrap_or(0);
        if len > limit {
            return Err(format!("{path} is larger than {} MB.", limit / 1024 / 1024));
        }
        let mut buf = Vec::with_capacity(len as usize);
        file.take(limit + 1).read_to_end(&mut buf).map_err(|e| io_err(&format!("Could not read {path}"), e))?;
        if buf.len() as u64 > limit {
            return Err(format!("{path} is larger than {} MB.", limit / 1024 / 1024));
        }
        Ok(buf)
    }

    /// Start a save. Returns a token naming a fresh staging folder.
    pub fn begin(&self) -> Result<String, String> {
        self.ensure_root()?;
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let token = format!("{nanos:x}-{:x}", COUNTER.fetch_add(1, Ordering::Relaxed));
        let dir = self.root.join(STAGING).join(&token);
        fs::create_dir_all(dir.join("character")).map_err(|e| io_err("Could not start saving", e))?;
        Ok(token)
    }

    fn staging_dir(&self, token: &str) -> Result<PathBuf, String> {
        if !valid_token(token) {
            return Err("Invalid save token.".into());
        }
        let dir = self.root.join(STAGING).join(token);
        if !dir.is_dir() {
            return Err("This save was already finished or cancelled.".into());
        }
        Ok(dir)
    }

    pub fn write(&self, token: &str, path: &str, data: &[u8]) -> Result<(), String> {
        if !valid_pack_path(path) {
            return Err(format!("\"{path}\" is not a pack file."));
        }
        if data.len() as u64 > size_limit(path) {
            return Err(format!("{path} is larger than {} MB.", size_limit(path) / 1024 / 1024));
        }
        let full = self.staging_dir(token)?.join(rel(path));
        fs::write(&full, data).map_err(|e| io_err(&format!("Could not write {path}"), e))
    }

    /// Swap the staged files in as pack `id`. When `replaces` names a different
    /// pack (the topic id was renamed), that old pack is removed afterwards.
    /// Fails without touching anything if `id` belongs to another existing pack.
    pub fn commit(&self, token: &str, id: &str, replaces: Option<&str>) -> Result<(), String> {
        let staged = self.staging_dir(token)?;
        let target = self.pack_dir(id)?;
        let replaces = replaces.filter(|r| !r.is_empty());
        if let Some(old) = replaces {
            self.pack_dir(old)?;
        }
        if !staged.join("topic.json").is_file() {
            return Err("Nothing to save: topic.json is missing.".into());
        }
        let renaming = replaces.is_some_and(|old| old != id);
        if target.exists() && (renaming || replaces.is_none()) {
            let _ = fs::remove_dir_all(&staged);
            return Err(format!("A pack with the id \"{id}\" already exists. Pick another id."));
        }
        // Move the current version aside, put the new one in place, then drop the old one.
        let old_dir = self.root.join(OLD);
        fs::create_dir_all(&old_dir).map_err(|e| io_err("Could not save", e))?;
        let backup = old_dir.join(token);
        let had_target = target.exists();
        if had_target {
            fs::rename(&target, &backup).map_err(|e| io_err("Could not replace the old version", e))?;
        }
        if let Err(e) = fs::rename(&staged, &target) {
            if had_target {
                let _ = fs::rename(&backup, &target);
            }
            return Err(io_err("Could not save", e));
        }
        let _ = fs::remove_dir_all(&backup);
        if renaming {
            if let Some(old) = replaces {
                let _ = fs::remove_dir_all(self.root.join(old));
            }
        }
        Ok(())
    }

    /// Abandon a staged save.
    pub fn cancel(&self, token: &str) -> Result<(), String> {
        let dir = self.staging_dir(token)?;
        fs::remove_dir_all(dir).map_err(|e| io_err("Could not clean up", e))
    }

    /// Move a pack to `trash_root/<id>-<time>` instead of deleting it outright.
    pub fn delete(&self, id: &str, trash_root: &Path) -> Result<(), String> {
        let dir = self.pack_dir(id)?;
        if !dir.exists() {
            return Ok(());
        }
        fs::create_dir_all(trash_root).map_err(|e| io_err("Could not create the trash folder", e))?;
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let dest = trash_root.join(format!("{id}-{secs}"));
        if fs::rename(&dir, &dest).is_err() {
            fs::remove_dir_all(&dir).map_err(|e| io_err("Could not delete the pack", e))?;
        }
        Ok(())
    }

    /// Remove staging and backup folders left behind by a crash.
    pub fn clean_leftovers(&self) {
        let _ = fs::remove_dir_all(self.root.join(STAGING));
        let _ = fs::remove_dir_all(self.root.join(OLD));
    }
}

/// A safe file name for an export: keeps letters, digits, '-', '_' and '.',
/// forces the given extension, and never starts with a dot.
pub fn safe_file_name(name: &str, ext: &str) -> String {
    let stem = name.rsplit(['/', '\\']).next().unwrap_or("");
    let stem = stem.strip_suffix(&format!(".{ext}")).unwrap_or(stem);
    let mut clean: String = stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    clean = clean.trim_matches('-').chars().take(80).collect();
    if clean.is_empty() {
        clean = "kiss-n-tell".into();
    }
    format!("{clean}.{ext}")
}

/// `dir/name`, or `dir/stem (2).ext` etc. if that file already exists.
pub fn unique_path(dir: &Path, file: &str) -> PathBuf {
    let first = dir.join(file);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = file.rsplit_once('.').unwrap_or((file, ""));
    for n in 2.. {
        let candidate = dir.join(format!("{stem} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, Store) {
        let tmp = tempfile::tempdir().unwrap();
        let s = Store::new(tmp.path().join("packs"));
        (tmp, s)
    }

    fn save(s: &Store, id: &str, replaces: Option<&str>, title: &str) -> Result<(), String> {
        let t = s.begin()?;
        s.write(&t, "topic.json", format!("{{\"id\":\"{id}\",\"title\":\"{title}\"}}").as_bytes())?;
        s.write(&t, "character/00.png", b"png")?;
        s.commit(&t, id, replaces)
    }

    #[test]
    fn ids_and_paths() {
        assert!(valid_id("animals"));
        assert!(valid_id("a-b_c9"));
        for bad in ["", "-a", "A", "a/b", "..", "a.b", "a b", &"a".repeat(65)] {
            assert!(!valid_id(bad), "{bad}");
        }
        for ok in ["topic.json", "questions.csv", "character/character.json", "character/00.webp", "character/10.svg", "character/07.jpeg"] {
            assert!(valid_pack_path(ok), "{ok}");
        }
        for bad in ["../topic.json", "character/11.png", "character/1.png", "character/00.gif", "character/../topic.json", "/topic.json", "character\\00.png", "character/00.png.exe", "x/topic.json"] {
            assert!(!valid_pack_path(bad), "{bad}");
        }
    }

    #[test]
    fn save_list_read_rename_delete() {
        let (tmp, s) = store();
        assert_eq!(s.list().unwrap(), Vec::<String>::new());
        save(&s, "one", None, "One").unwrap();
        assert_eq!(s.list().unwrap(), vec!["one"]);
        assert_eq!(s.files("one").unwrap(), vec!["character/00.png", "topic.json"]);
        assert!(String::from_utf8(s.read("one", "topic.json").unwrap()).unwrap().contains("One"));

        // Overwrite in place.
        save(&s, "one", Some("one"), "Uno").unwrap();
        assert!(String::from_utf8(s.read("one", "topic.json").unwrap()).unwrap().contains("Uno"));

        // A new pack cannot take an existing id.
        assert!(save(&s, "one", None, "Clash").unwrap_err().contains("already exists"));

        // Rename.
        save(&s, "two", Some("one"), "Two").unwrap();
        assert_eq!(s.list().unwrap(), vec!["two"]);

        // Rename onto another pack is refused and keeps both.
        save(&s, "three", None, "Three").unwrap();
        assert!(save(&s, "three", Some("two"), "x").is_err());
        assert_eq!(s.list().unwrap(), vec!["three", "two"]);

        // Delete goes to the trash.
        let trash = tmp.path().join("trash");
        s.delete("two", &trash).unwrap();
        assert_eq!(s.list().unwrap(), vec!["three"]);
        assert_eq!(fs::read_dir(&trash).unwrap().count(), 1);

        // No leftovers.
        s.clean_leftovers();
        assert!(!s.root.join(STAGING).exists());
    }

    #[test]
    fn refuses_bad_input() {
        let (_tmp, s) = store();
        let t = s.begin().unwrap();
        assert!(s.write(&t, "../evil", b"x").is_err());
        assert!(s.write(&t, "character/00.png", &vec![0u8; (MAX_IMAGE_BYTES + 1) as usize]).is_err());
        assert!(s.write("../../x", "topic.json", b"x").is_err());
        assert!(s.write("nope", "topic.json", b"x").is_err());
        assert!(s.read("../x", "topic.json").is_err());
        assert!(s.read("one", "../../etc/passwd").is_err());
        assert!(s.commit(&t, "Bad Id", None).is_err());
        // Nothing staged yet: refuses to save an empty pack.
        assert!(s.commit(&t, "empty", None).unwrap_err().contains("topic.json"));
        s.cancel(&t).unwrap();
        assert!(s.write(&t, "topic.json", b"x").is_err());
    }

    #[test]
    fn file_names() {
        assert_eq!(safe_file_name("animals-pack", "zip"), "animals-pack.zip");
        assert_eq!(safe_file_name("../../evil name.zip", "zip"), "evil-name.zip");
        assert_eq!(safe_file_name("C:\\x\\..\\y", "png"), "y.png");
        assert_eq!(safe_file_name("...", "zip"), "kiss-n-tell.zip");
        assert_eq!(safe_file_name("local:animals", "png"), "local-animals.png");
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("a.zip"), b"").unwrap();
        assert_eq!(unique_path(tmp.path(), "a.zip"), tmp.path().join("a (2).zip"));
        assert_eq!(unique_path(tmp.path(), "b.zip"), tmp.path().join("b.zip"));
    }
}
