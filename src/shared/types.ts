export interface Draft {
  content: string;
  filePath: string | null;
  dirty: boolean;
  updatedAt: string;
}

export interface OpenedDocument {
  content: string;
  filePath: string;
}

export type DocumentAction = 'new' | 'open' | 'save' | 'saveAs' | 'png' | 'svg';

export interface DesktopApi {
  openDocument(): Promise<OpenedDocument | null>;
  saveDocument(content: string, saveAs: boolean): Promise<string | null>;
  exportDocument(format: 'png' | 'svg', data: Uint8Array): Promise<string | null>;
  readDraft(): Promise<Draft | null>;
  writeDraft(draft: Draft): Promise<void>;
  setActiveDocument(filePath: string | null): Promise<void>;
  confirmDiscard(): Promise<'save' | 'discard' | 'cancel'>;
  setDirty(dirty: boolean): void;
  setTitle(title: string): void;
  closeReady(): void;
  isFullScreen(): Promise<boolean>;
  exitFullScreen(): Promise<void>;
  onFullScreenChange(callback: (fullScreen: boolean) => void): () => void;
  onAction(callback: (action: DocumentAction) => void): () => void;
  onCloseRequest(callback: () => void): () => void;
}
