import {initialState, validateState, clone} from './model.mjs';

const DATABASE = 'ohako-library';
export class ConflictError extends Error {
  constructor() { super('別の画面でデータが更新されています。最新の内容を確認してから保存してください。入力内容は下書きに残っています。'); this.name = 'ConflictError'; }
}
export function openStorage(databaseName = DATABASE) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('別のOHAKOを閉じてから、もう一度開いてください。'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(new Store(db));
    };
  });
}

class Store {
  constructor(db) { this.db = db; }
  close() { this.db.close(); }
  get(key) {
    return new Promise((resolve, reject) => {
      const request = this.db.transaction('records').objectStore('records').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  put(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('records', 'readwrite');
      const records = transaction.objectStore('records');
      if (value === undefined) records.delete(key); else records.put(value, key);
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('端末への保存に失敗しました。'));
    });
  }
  async load() {
    const raw = await this.get('library');
    if (raw === undefined) return initialState();
    return validateState(raw);
  }
  save(next, expectedRevision, {snapshot = false, clearDraft = false} = {}) {
    const verified = validateState(next);
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('records', 'readwrite');
      const records = transaction.objectStore('records');
      let saved, failure;
      const request = records.get('library');
      request.onsuccess = () => {
        const previous = request.result;
        if ((previous?.revision ?? 0) !== expectedRevision) { failure = new ConflictError(); transaction.abort(); return; }
        saved = {...clone(verified), revision: expectedRevision + 1, modifiedAt: new Date().toISOString()};
        if (snapshot && previous) records.put(previous, 'beforeRestore');
        records.put(saved, 'library');
        if (clearDraft === '*') {
          const keys = records.getAllKeys();
          keys.onsuccess = () => keys.result.filter(key => String(key).startsWith('draft:')).forEach(key => records.delete(key));
        } else if (typeof clearDraft === 'string') records.delete(clearDraft);
      };
      transaction.oncomplete = () => resolve(saved);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('端末への保存に失敗しました。空き容量を確認してください。'));
      transaction.onerror = () => { failure ??= transaction.error; };
    });
  }
  async markExported(revision) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('records', 'readwrite');
      const records = transaction.objectStore('records');
      let saved;
      const request = records.get('library');
      request.onsuccess = () => {
        saved = request.result ?? initialState();
        saved.lastExportAt = new Date().toISOString();
        saved.lastExportRevision = revision;
        records.put(saved, 'library');
      };
      transaction.oncomplete = () => resolve(saved);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('書き出し日時を保存できませんでした。'));
    });
  }
}
