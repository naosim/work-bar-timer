interface Window {
  NL_PORT?: number;
  NL_TOKEN?: string;
}

declare const Neutralino: {
  init: () => Promise<void>;
  os: {
    showNotification: (title: string, message: string, type: string) => Promise<void>;
  };
  window: {
    setDraggableRegion: (elementId: string, options?: { exclude?: string[] }) => Promise<void>;
    minimize: () => Promise<void>;
    setAlwaysOnTop: (onTop: boolean) => Promise<void>;
    focus: () => Promise<void>;
  };
  app: {
    exit: () => Promise<void>;
  };
  events: {
    on: (event: string, handler: (event: { detail: any }) => void) => void;
    broadcast: (event: string, data: any) => Promise<void>;
  };
  extensions: {
    dispatch: (extensionId: string, eventName: string, data: any) => Promise<void>;
  };
  filesystem: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    appendFile: (path: string, content: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
};
