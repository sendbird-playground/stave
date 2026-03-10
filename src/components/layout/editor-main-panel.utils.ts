type DisposableModel = {
  dispose(): void;
};

interface DiffEditorModelPair {
  original: DisposableModel | null | undefined;
  modified: DisposableModel | null | undefined;
}

export interface DiffEditorModelOwner {
  getModel(): DiffEditorModelPair | null;
  setModel(model: null): void;
}

export function releaseDiffEditorModels(editor: DiffEditorModelOwner | null) {
  const model = editor?.getModel();
  if (!editor || !model) {
    return false;
  }

  editor.setModel(null);
  model.original?.dispose();
  model.modified?.dispose();
  return true;
}
