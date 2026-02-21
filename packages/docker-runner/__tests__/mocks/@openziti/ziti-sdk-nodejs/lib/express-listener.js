import express from 'express';

class MockExpressListener {}

MockExpressListener.prototype.listen = function listen(...args) {
  if (!this.__mockApp) {
    this.__mockApp = express();
  }
  const server = this.__mockApp.listen(...args);
  return server;
};

export { MockExpressListener as Server };
