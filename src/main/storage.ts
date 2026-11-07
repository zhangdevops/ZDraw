import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Draft } from '../shared/types';

export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

// 统一保存为 Excalidraw 格式，兼容转换此前保存的 ZDraw 文件。
export function toExcalidrawPath(filePath: string): string {
  if (/\.excalidraw$/i.test(filePath)) {
    return filePath;
  }
  if (/\.zdraw$/i.test(filePath)) {
    return filePath.replace(/\.zdraw$/i, '.excalidraw');
  }
  return `${filePath}.excalidraw`;
}

// 拒绝错误格式和过大文档，避免覆盖现有图纸。
export function validateDocument(content: string): void {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_DOCUMENT_BYTES) {
    throw new Error('图纸超过 100 MB，或内容格式无效。');
  }
  const value = JSON.parse(content);
  if (value?.type !== 'excalidraw' || !Array.isArray(value.elements)) {
    throw new Error('请选择有效的 .excalidraw 或 .zdraw 图纸。');
  }
  if (
    !value.elements.every((element: unknown) => {
      return typeof element === 'object' && element !== null && 'type' in element;
    })
  ) {
    throw new Error('图纸包含无效元素。');
  }
}

// 在同一目录写入临时文件后替换，降低保存中断损坏原文件的风险。
export async function atomicWrite(filePath: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { flush: true });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

// 顺序保存草稿，避免较旧的异步写入覆盖新版本。
export class DraftStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<Draft | null> {
    // 等待正在进行的写入，再读取恢复副本。
    await this.queue;
    try {
      const draft = JSON.parse(await readFile(this.filePath, 'utf8')) as Draft;
      validateDocument(draft.content);
      if (draft.filePath !== null && typeof draft.filePath !== 'string') {
        throw new Error('恢复文件路径无效。');
      }
      return draft;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      await copyFile(this.filePath, `${this.filePath}.corrupt-${Date.now()}`).catch(
        () => undefined
      );
      throw new Error('恢复副本无法读取。原文件已保留，请手动打开图纸。');
    }
  }

  write(draft: Draft): Promise<void> {
    // 验证后立即序列化，保存调用时的快照。
    validateDocument(draft.content);
    const content = JSON.stringify(draft);
    const operation = this.queue.then(() => atomicWrite(this.filePath, content));
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
