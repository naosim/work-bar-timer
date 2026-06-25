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
    on: (event: string, handler: () => void) => void;
  };
};
