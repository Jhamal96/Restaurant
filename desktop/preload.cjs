'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nibbleIntro', Object.freeze({
  finish: (remember) => {
    if (location.protocol === 'file:') ipcRenderer.send('nibble:intro-done',remember===true);
  }
}));
