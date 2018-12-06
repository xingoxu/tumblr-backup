const { app, BrowserWindow } = require('electron');
const url = require('url');
const qs = require('querystring');
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

const http = require('http');

const server = http.createServer(function (request, response) {

  response.writeHead(200, { 'Content-Type': 'text/plain' });

  response.end(`
    We have received the tumblr user info. Now you can close this page.
    成功获得用户信息，现在你可以关闭此页面。
    ユーザー情報取得しました、このページを閉じても大丈夫です。
  `);
  let search = url.parse(request.url).search;
  if (!search) return;
  win.webContents.send('loginCallback',qs.parse(search.slice(1)));
});

function createWindow () {
  server.listen(23285);
  // Create the browser window.
  win = new BrowserWindow({ width: 800, height: 600 })

  // and load the index.html of the app.
  win.loadFile('browser_page/index.html');

  // Open the DevTools.
  win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
    server.close();
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
});