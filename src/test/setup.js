import '@testing-library/jest-dom';

// Polyfill ResizeObserver for React Flow in jsdom test environment
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
