'use strict';
const {app,BrowserWindow,shell,session,ipcMain,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');

const WEB_URL='https://restaurant.ajdapp.org';
const ALLOWED_ORIGIN=new URL(WEB_URL).origin;
let win;
const FIRST_RUN_MARKER=()=>path.join(app.getPath('userData'),'nibblespot-welcome-seen-v1');
function isTrusted(raw){try{const u=new URL(raw);return u.protocol==='https:'&&u.origin===ALLOWED_ORIGIN}catch{return false}}
function external(raw){try{const u=new URL(raw);if(u.protocol==='https:'&&u.origin!==ALLOWED_ORIGIN) shell.openExternal(u.href)}catch{}}
function openWebsite(window){window.loadURL(WEB_URL)}
function openIntro(window){
  const seen=fs.existsSync(FIRST_RUN_MARKER());
  window.loadFile(path.join(__dirname,'intro.html'),{query:{first:seen?'0':'1'}});
}
ipcMain.on('nibble:intro-done',(event,remember)=>{
  if(!event.senderFrame?.url.startsWith('file://')) return;
  const window=BrowserWindow.fromWebContents(event.sender);
  if(!window||window.isDestroyed())return;
  if(remember){try{fs.mkdirSync(path.dirname(FIRST_RUN_MARKER()),{recursive:true});fs.writeFileSync(FIRST_RUN_MARKER(),'yes')}catch{}}
  openWebsite(window);
});
function createWindow(){
  win=new BrowserWindow({
    title:'NibbleSpot — Our Table',
    width:1200,height:840,minWidth:880,minHeight:650,
    show:false,autoHideMenuBar:true,backgroundColor:'#f9f5ee',
    icon:path.join(__dirname,'icon.png'),
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      webSecurity:true,allowRunningInsecureContent:false
    }
  });
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'}});
  win.webContents.on('will-navigate',(event,url)=>{
    if(isTrusted(url))return;
    event.preventDefault();external(url);
  });
  win.webContents.on('will-redirect',(event,url)=>{
    if(isTrusted(url))return;
    event.preventDefault();external(url);
  });
  // Block untrusted OS-level navigation and downloads; the app only displays its HTTPS website.
  win.webContents.session.on('will-download',(event,item)=>{
    const url=item.getURL();
    if(!isTrusted(url))event.preventDefault();
  });
  openIntro(win);
}
app.whenReady().then(()=>{
  if(process.platform==='win32')app.setAppUserModelId('org.ajdapp.nibblespot');
  session.defaultSession.setPermissionCheckHandler((webContents,permission,origin)=>{
    return isTrusted(origin)&&['geolocation','fullscreen'].includes(permission);
  });
  session.defaultSession.setPermissionRequestHandler(async(contents,permission,callback,details)=>{
    const origin=details?.requestingUrl||contents.getURL();
    if(!isTrusted(origin)||!['geolocation','fullscreen'].includes(permission)){callback(false);return}
    if(permission==='fullscreen'){callback(true);return}
    try{
      const response=await dialog.showMessageBox(BrowserWindow.fromWebContents(contents),{
        type:'question',title:'NibbleSpot location access',
        message:'Allow NibbleSpot to use your approximate location?',
        detail:'Used only when you select “Near me” to find nearby restaurants. You can search cities without sharing your location.',
        buttons:['Not now','Allow once'],defaultId:0,cancelId:0,noLink:true
      });
      callback(response.response===1);
    }catch{callback(false)}
  });
  createWindow();
  app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
