import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, DraftStore, validateDocument } from '../src/main/storage';

// 构造包含图片数据的图纸，验证完整保存而非仅保存元素位置。
function document(text: string): string {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    elements: [{ id: 'text-1', type: 'text', text }],
    files: { 'image-1': { dataURL: 'data:image/png;base64,test-image-data' } },
  });
}

test('原子写入支持覆盖并保留图片和中文，没有遗留临时文件', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zdraw-storage-'));
  try {
    const path = join(directory, '图纸.excalidraw');
    await atomicWrite(path, document('初稿'));
    await atomicWrite(path, document('修改后'));
    assert.equal(await readFile(path, 'utf8'), document('修改后'));
    assert.deepEqual(await readdir(directory), ['图纸.excalidraw']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('草稿并发写入保持先后顺序，重启后恢复最新内容', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zdraw-draft-'));
  try {
    const path = join(directory, 'recovery.json');
    const store = new DraftStore(path);
    const writes = ['一', '二', '三'].map((value) => {
      return store.write({
        content: document(value),
        dirty: true,
        filePath: null,
        updatedAt: value,
      });
    });
    await Promise.all(writes);
    const reopened = await new DraftStore(path).read();
    assert.equal(reopened?.content, document('三'));
    assert.equal(reopened?.dirty, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('无效图纸不会覆盖有效草稿，损坏草稿保留故障副本', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zdraw-invalid-'));
  try {
    const path = join(directory, 'recovery.json');
    const store = new DraftStore(path);
    assert.equal(await store.read(), null);
    await store.write({ content: document('保留'), dirty: true, filePath: null, updatedAt: '' });
    assert.throws(() => validateDocument('{"elements":[]}'));
    assert.throws(() => store.write({ content: '{}', dirty: true, filePath: null, updatedAt: '' }));
    assert.equal((await store.read())?.content, document('保留'));
    await writeFile(path, 'broken');
    await assert.rejects(store.read(), /恢复副本无法读取/);
    assert.ok((await readdir(directory)).some((name) => name.includes('.corrupt-')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
