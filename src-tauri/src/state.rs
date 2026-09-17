use tokio::sync::watch;

use crate::error::AppError;

pub struct DownloadController {
    cancel: std::sync::Mutex<Option<watch::Sender<bool>>>,
}

pub struct DownloadSession<'a> {
    controller: &'a DownloadController,
    pub cancel_rx: watch::Receiver<bool>,
}

impl DownloadController {
    pub fn new() -> Self {
        Self {
            cancel: std::sync::Mutex::new(None),
        }
    }

    pub fn start_session(&self) -> Result<DownloadSession<'_>, AppError> {
        let mut slot = self
            .cancel
            .lock()
            .map_err(|_| AppError::new("internal", "다운로드 상태를 확인하지 못했습니다."))?;

        if slot.is_some() {
            return Err(AppError::already_downloading());
        }

        let (tx, rx) = watch::channel(false);
        *slot = Some(tx);

        Ok(DownloadSession {
            controller: self,
            cancel_rx: rx,
        })
    }

    pub fn request_cancel(&self) {
        if let Ok(slot) = self.cancel.lock() {
            if let Some(tx) = slot.as_ref() {
                let _ = tx.send(true);
            }
        }
    }

    pub fn is_busy(&self) -> bool {
        self.cancel
            .lock()
            .ok()
            .is_some_and(|slot| slot.is_some())
    }

    fn end(&self) {
        if let Ok(mut slot) = self.cancel.lock() {
            *slot = None;
        }
    }
}

impl Drop for DownloadSession<'_> {
    fn drop(&mut self) {
        self.controller.end();
    }
}
