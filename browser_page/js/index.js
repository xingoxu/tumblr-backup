const request = require('request');
const storage = require('electron-json-storage');
const { app } = require('electron').remote;
const { shell, ipcRenderer } = require('electron');
const qs = require('querystring');
const fs = require('fs');
const pLimit = require('p-limit');
const limit = pLimit(50);

new Promise((resolve, reject) => {
  storage.getMany(['user', 'settings', 'firstRun'], function (err, data) {
    if (err) {
      console.log(err);
      reject()
    }
    resolve(data);
  });
}).then(({ user, settings, firstRun }) => {
  storage.set('firstRun', { isFirstRun: false });
  window.v = new Vue({
    el: '#app',
    data() {
      return {
        activeTab: firstRun.isFirstRun === false ? 'userDownload' : 'settings',
        showDonate: false,
        user: Object.assign({
          key: null,
          secret: null,
          name: null,
        }, user),
        favouriteDownload: {
          gettingFavouriteDownloadImages: false,
          favouriteImages: [],
          downloadAll: false,
          nextPage: false,
          downloadAllLoadingText: '',
          favouriteDownloadLoadingDialog: false,
        },
        userDownload: {
          userDownloadUrlInput: '',
          gettingUserDownloadImages: false,
          userImages: [],
          downloadAll: false,
          nextPage: false,
          downloadAllLoadingText: '',
          userDownloadLoadingDialog: false,
        },
        settings: Object.assign({
          savePath: app.getPath('desktop'),
          API_KEY: 'ttWKklONSmaevIswNp4iyA4gsgzCUYrkCXfAAYRMk8faoiRVYG',
          API_Secret: 'HuHQ3aMQNtzceOMKRiMcpMLMJ0lci0aplmgA6D1LGvBLcoVAsG',
        }, settings),
        settingPage: {
          generatingLoginPage: false,
          tumblrLoginError: null,
          auth_request: {},
          showAPIChange: false,
        },
        downloadManager: {
          downloadQueue: [],
          pageIndex: 1,
        },
        followingUser: {
          userFollowing: [],
          nextPage: false,
          gettingFollowing: false,
          followingUserLoadingDialog: false,
        },
      }
    },
    computed: {
      userDownloadAllChecked() {
        return this.userDownload.userImages.length > 0 && this.userDownload.userImages.every(img => img.checked);
      },
      favouriteDownloadAllChecked() {
        return this.favouriteDownload.favouriteImages.length > 0 && this.favouriteDownload.favouriteImages.every(img => img.checked);
      },
      showDownloadQueue() {
        let pageIndex = this.downloadManager.pageIndex;
        return this.downloadManager.downloadQueue.slice((pageIndex - 1) * 200, pageIndex * 200 - 1);
      },
    },
    created() {
      ipcRenderer.on('loginCallback', (event, data) => {
        this.loginCallback(data);
      });
      if (this.user.key) {
        this.getUserInfo();
      }
      var logger = document.getElementById('log');
      let that = this;
      // console.log = function () {
      //   let messages = [].slice.call(arguments);
      //   let html = messages.reduce((prev, current) => {
      //     let html = '';
      //     if (current instanceof Error) {
      //       html = current.stack;
      //     }
      //     else if (typeof current == 'object') {
      //       html = (JSON && JSON.stringify ? JSON.stringify(current) : current);
      //     } else {
      //       html = current;
      //     }
      //     return prev + '  ' + html
      //   }, '');
      //   that.$refs.consoleDiv.innerText += new Date().toLocaleString() + html + '\n';
      //   console._log(...messages);
      // }
    },
    methods: {
      getAuthObject() {
        if (this.user.key) {
          return {
            consumer_key: this.settings.API_KEY,
            consumer_secret: this.settings.API_Secret,
            token: this.user.key,
            token_secret: this.user.secret
          }
        } else {
          return {
            consumer_key: this.settings.API_KEY,
            consumer_secret: this.settings.API_Secret
          }
        }
      },
      getUserPics() {
        let matchResult = this.userDownload.userDownloadUrlInput.match(/(^https?:\/\/)?(?<id>[\w-]+)(\.tumblr\.com\/?)?$/i);
        let userId = '';
        if (matchResult && matchResult.groups.id) {
          userId = matchResult.groups.id;
        }
        if (!userId || userId == '') {
          // userInput wrong
          return;
        }
        this.userDownload.gettingUserDownloadImages = true;

        return this.fetchUserPics(`https://api.tumblr.com/v2/blog/${userId}.tumblr.com/posts`).then(({ userImages, nextPage }) => {
          this.userDownload.userImages = userImages;
          this.userDownload.nextPage = nextPage;
        }).catch(error => {
          console.log(error);
        }).then(() => {
          this.userDownload.gettingUserDownloadImages = false;
        });
      },
      getUserPicsNextPage() {
        this.userDownload.gettingUserDownloadImages = true;
        return this.fetchUserPics(this.userDownload.nextPage).then(({ userImages, nextPage }) => {
          this.userDownload.userImages = this.userDownload.userImages.concat(userImages);
          this.userDownload.nextPage = nextPage;
        }).catch((err) => console.log('getUserPicsNextPage',err)).then(() => {
          this.userDownload.gettingUserDownloadImages = false;
        });
      },
      fetchUserPics(url) {
        return new Promise((resolve, reject) => {
          request.get({
            url,
            oauth: this.getAuthObject(),
            json: true
          }, (error, response, body) => {
            if (error) {
              // error
              reject(error);
              return;
            }
            if (body.errors || body.meta.status != 200) {
              // error
              reject(body.errors || body.meta.msg);
              return;
            }
            if (body.response.total_posts > 20000) {
              this.$notify.error({
                title: '错误',
                message: '由于Tumblr官方API限制，暂不支持20000条以上博客的备份，请使用用户下载进行备份（每小时1000次）'
              });
              reject('Total Posts is too many to download because of the rate limit of Tumblr official');
            }

            resolve({
              userImages: this.getDownloadItems(body.response.posts),
              nextPage: this.setNextPageUserDownload(body.response)
            });
          });
        });
      },
      getDownloadItems(posts) {
        let downloadItems = [];
        posts.forEach(post => {
          switch (post.type) {
            case 'photo': {
              post.photos.forEach((photo, index) => {
                if (!photo.original_size.url) return;
                downloadItems.push({
                  thumbnail: photo.original_size.url,
                  folder: post.blog_name,
                  src: photo.original_size.url,
                  summary: post.summary,
                  date: post.date,
                  post_url: post.post_url,
                  key: `${post.reblog_key}_${index}`,
                  checked: false,
                });
              });
              break;
            }
            case 'video': {
              if (!photo.video_url) break;
                downloadItems.push({
                thumbnail: post.thumbnail_url,
                src: post.video_url,
                folder: post.blog_name,
                summary: post.summary,
                date: post.date,
                post_url: post.post_url,
                key: `${post.reblog_key}`,
                checked: false,
              });
              break;
            }
            case 'text': {
              let items = processText(post.body, 'text');
              downloadItems = downloadItems.concat(items);
              break;
            }
          }
          if (post.reblog && post.reblog.comment) {
            downloadItems = downloadItems.concat(processText(post.reblog.comment, 'reblog'));
          }
          function processText(text, identifier) {
            let items = [];
            let $nodes = $($.parseHTML(text));
            let imgSet = [].slice.call($nodes.find('img'));

            imgSet.forEach((img, index) => {
              if (!img.src) return;
              let src = img.src.replace('_540', '_1280');
              src = img.src.replace('_640', '_1280');
              src = img.src.replace('_500', '_1280');
              src = img.src.replace('_400', '_1280');
              items.push({
                thumbnail: src,
                folder: post.blog_name,
                src: src,
                summary: '',
                date: post.date,
                post_url: post.post_url,
                key: `${post.reblog_key}_img_${index}_${identifier}`,
                checked: false,
              });
            });

            let videoSet = [].slice.call($nodes.find('video'));
            videoSet.forEach((video, index) => {
              if (!video.currentSrc) return;
              items.push({
                thumbnail: video.poster,
                folder: post.blog_name,
                src: video.currentSrc,
                summary: '',
                date: post.date,
                post_url: post.post_url,
                key: `${post.reblog_key}_video_${index}_${identifier}`,
                checked: false,
              });
            });
            return items;
          }

        });
        return downloadItems;
      },
      setNextPageUserDownload(response) {
        if (response.posts.length <= 0) {
          return false;
        }
        else return `https://api.tumblr.com${response._links.next.href}`;
      },
      userDownloadCheckAll($event) {
        this.userDownload.userImages.forEach(img => (img.checked = $event));
      },
      async downloadUserDownload() {
        let downloadItem;
        this.userDownload.userDownloadLoadingDialog = true;
        try {
          let userId = this.userDownload.userImages[0].folder;
          downloadItem = await this.getUserDownloadItem(userId);
        } catch (e) {
          console.log(e, this.userDownload.downloadAllLoadingText);
          this.userDownload.userDownloadLoadingDialog = false;
          return;
        }
        this.userDownload.userDownloadLoadingDialog = false;
        downloadItem.map(item => limit(() => this.addDownloadQueue(item)));
      },
      async getUserDownloadItem(userId) {
        if (this.userDownload.downloadAll) {
          downloadItem = await this.fetchUserDownloadItem(`https://api.tumblr.com/v2/blog/${userId}.tumblr.com/posts`);
        } else {
          downloadItem = this.userDownload.userImages.filter(value => value.checked);
        }
        return downloadItem;
      },
      async fetchUserDownloadItem(firstURL) {
        let downloadItem = [];
        let { userImages, nextPage } = await this.fetchUserPics(firstURL);
        downloadItem = userImages;
        let count = 1;
        while (nextPage != false) {
          this.userDownload.downloadAllLoadingText = nextPage;
          let { userImages: a, nextPage: b } = await this.fetchUserPics(nextPage);
          downloadItem = downloadItem.concat(a);
          nextPage = b;
          count++;
          if (count >= 900) {
            this.$alert(`本次下载API调用次数超过900次，请保存以下网址可在之后继续下载后续<br><code>${nextPage}</code>`, '中断下载', {
              confirmButtonText: '朕已阅',
              dangerouslyUseHTMLString: true
            });
            break;
          }
        }
        return downloadItem;
      },
      favouriteDownloadCheckAll($event) {
        this.favouriteDownload.favouriteImages.forEach(img => (img.checked = $event));
      },
      showSaveDialog() {
        let { dialog, getCurrentWindow } = require('electron').remote;
        dialog.showOpenDialog(getCurrentWindow(), {
          properties: ['openDirectory', 'createDirectory']
        }, path => {
          if (!path) return;
          this.settings.savePath = path[0];
        });
      },
      saveSettings() {
        storage.set('settings', this.settings, error => {
          // error handle
          console.log(error);
        });
      },
      generateLoginPage() {
        this.generatingLoginPage = true;
        request.post({
          url: 'https://www.tumblr.com/oauth/request_token',
          oauth: {
            consumer_key: this.settings.API_KEY,
            consumer_secret: this.settings.API_Secret
          }
        }, (e, r, body) => {
          let auth_request = qs.parse(body);
          let redirect_url = `https://www.tumblr.com/oauth/authorize?${qs.stringify({ oauth_token: auth_request.oauth_token })}`;
          this.settingPage.auth_request = auth_request;
          shell.openExternal(redirect_url);
          this.generatingLoginPage = false;
        });
      },
      openLinkExternal(url) {
        shell.openExternal(url);
      },
      loginCallback(auth_data) {
        try {
          let { oauth_token, oauth_verifier } = auth_data;
        } catch (e) {
          return;
        }
        this.generatingLoginPage = true;
        request.post({
          url: 'https://www.tumblr.com/oauth/access_token',
          oauth: {
            ...this.getAuthObject(),
            token: auth_data.oauth_token,
            token_secret: this.settingPage.auth_request.oauth_token_secret,
            verifier: auth_data.oauth_verifier
          }
        }, (err, r, body) => {
          this.generatingLoginPage = false;
          if (err) {
            console.log(err);
            this.settingPage.tumblrLoginError = '获得用户access_key失败，请尝试重新连接';
            return;
          }
          this.settingPage.tumblrLoginError = null;
          let user_key = qs.parse(body);
          this.user.key = user_key.oauth_token;
          this.user.secret = user_key.oauth_token_secret;

          this.getUserInfo();
          storage.set('user', {
            key: this.user.key,
            secret: this.user.secret
          }, error => {
            // error handle
            this.$refs.consoleDiv.innerText += (error.stack + '\n');
            console.log(error);
          });
        })
      },
      getUserInfo() {
        this.generatingLoginPage = true;
        request.get({
          url: `https://api.tumblr.com/v2/user/info`,
          oauth: this.getAuthObject(),
          json: true,
        }, (error, r, body) => {
          this.generatingLoginPage = false;
          if (error || body.errors) {
            // error
            console.log(error || body.errors);
            this.settingPage.tumblrLoginError = '获得用户信息失败，建议尝试重新连接';
            this.user.name = null;
            return;
          }
          this.settingPage.tumblrLoginError = false;
          this.user.name = body.response.user.name;
        });
      },
      getFavouriteDownload() {
        if (!this.user.key) {
          return;
        }
        this.favouriteDownload.gettingFavouriteDownloadImages = true;
        this.fetchFavouriteDownload(`https://api.tumblr.com/v2/user/likes`).then(({ favouriteImages, nextPage }) => {
          this.favouriteDownload.favouriteImages = favouriteImages;
          this.favouriteDownload.nextPage = nextPage;
        }).catch(console.log).then(() => {
          this.favouriteDownload.gettingFavouriteDownloadImages = false;
        });
      },
      getFavouriteDownloadNextPage() {
        this.favouriteDownload.gettingFavouriteDownloadImages = true;
        return this.fetchFavouriteDownload(this.favouriteDownload.nextPage).then(({ favouriteImages, nextPage }) => {
          this.favouriteDownload.favouriteImages = this.favouriteDownload.favouriteImages.concat(favouriteImages);
          this.favouriteDownload.nextPage = nextPage;
        }).catch(console.log).then(() => {
          this.favouriteDownload.gettingFavouriteDownloadImages = false;
        });
      },
      fetchFavouriteDownload(url) {
        return new Promise((resolve, reject) => {
          request.get({
            url,
            oauth: this.getAuthObject(),
            json: true
          }, (error, response, body) => {
            if (error) {
              // error
              reject(error);
              return;
            }
            if (body.errors) {
              // error
              reject(body.errors);
              return;
            }

            resolve({
              favouriteImages: this.getDownloadItems(body.response.liked_posts),
              nextPage: this.setNextPageFavouriteDownload(body.response)
            });
          });
        });
      },
      async downloadFavouriteDownload() {
        let downloadItem
        this.favouriteDownload.favouriteDownloadLoadingDialog = true;
        try {
          downloadItem = await this.getFavouriteDownloadItem();
        } catch (e) {
          console.log(this.favouriteDownload.downloadAllLoadingText, e);
          this.favouriteDownload.favouriteDownloadLoadingDialog = false;
          return;
        }
        this.favouriteDownload.favouriteDownloadLoadingDialog = false;
        downloadItem.map(item => limit(() => this.addDownloadQueue(item)));
      },
      async getFavouriteDownloadItem() {
        let downloadItem = [];
        if (this.favouriteDownload.downloadAll) {
          downloadItem = await this.fetchFavouriteDownloadItem(`https://api.tumblr.com/v2/user/likes`);
        } else {
          downloadItem = this.favouriteDownload.favouriteImages.filter(value => value.checked);
        }
        return downloadItem;
      },
      async fetchFavouriteDownloadItem(startURL) {
        let downloadItem = [];
        let { favouriteImages, nextPage } = await this.fetchFavouriteDownload(startURL);
        downloadItem = favouriteImages;
        let count = 1;
        while (nextPage != false) {
          this.favouriteDownload.downloadAllLoadingText = nextPage;
          let { favouriteImages: a, nextPage: b } = await this.fetchFavouriteDownload(nextPage);
          downloadItem = downloadItem.concat(a);
          nextPage = b;
          count++;
          if (count >= 900) {
            this.$alert(`本次下载API调用次数超过900次，请保存以下网址可在之后继续下载后续<br><code>${nextPage}</code>`, '中断下载', {
              confirmButtonText: '朕已阅',
              dangerouslyUseHTMLString: true
            });
            break;
          }
        }
        return downloadItem;
      },
      resumeDownload(mode) {
        this.$prompt('请输入恢复下载网址：', '恢复下载', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
        }).then(({ value }) => {
          switch (mode) {
            case 'favourite':
              this.favouriteDownload.favouriteDownloadLoadingDialog = true;
              return this.fetchFavouriteDownloadItem(value);
            case 'user':
              this.userDownload.userDownloadLoadingDialog = true;
              return this.fetchUserDownloadItem(value);
          }
        }).then(downloadItem => {
          downloadItem.map(item => limit(() => this.addDownloadQueue(item)));              this.favouriteDownload.favouriteDownloadLoadingDialog = false;
          this.userDownload.userDownloadLoadingDialog = false;
        });
      },
      setNextPageFavouriteDownload(response) {
        if (response.liked_posts.length <= 0) {
          return false;
        }
        else return `https://api.tumblr.com${response._links.next.href}`;
      },
      // thumbnail: photo.original_size.url,
      // folder: post.blog_name,
      // src: photo.original_size.url,
      // summary: post.summary,
      // date: post.date,
      // post_url: post.post_url,
      // key: `${post.reblog_key}_${index}`,
      // checked: false,
      addDownloadQueue({ folder, src, post_url, key }) {
        let item = {
          folder,
          src,
          post_url,
          key,
          add_time: (new Date()).toLocaleString(),
          status: 'downloading'
        };
        this.downloadManager.downloadQueue.push(item);
        return this._download(item);
      },
      _download(downloadItem) {
        let { folder, src } = downloadItem;
        let downloadPath = this.settings.savePath;
        try {
          fs.accessSync(`${downloadPath}/${folder}`, fs.constants.F_OK | fs.constants.W_OK);
        } catch (error) {
          if (error.code == 'ENOENT') {
            try {
              fs.mkdirSync(`${downloadPath}/${folder}`, { recursive: true });
            } catch (e) {
              return Promise.reject(e);
            }
          } else {
            return Promise.reject(error);
          }
        }
        return new Promise((resolve, reject) => {
          request.get(src).on('error', reject).pipe(fs.createWriteStream(`${downloadPath}/${folder}/${this.getFileName(src)}`)).on('close', resolve).on('error', reject);
        }).then(() => {
          downloadItem.status = 'completed';
        }).catch(e => {
          console.log('error in download', e);
          downloadItem.status = 'error';
        });
      },
      getFileName(url) {
        const urlUtil = require('url');
        let fileNameArray;
        try {
          fileNameArray = urlUtil.parse(url).pathname.split('/');
        } catch (e) {
          console.log('error in getFileName', url);
          throw e;
        }
        return fileNameArray[fileNameArray.length - 1];
      },
      removeDownloaded() {
        this.downloadManager.downloadQueue = this.downloadManager.downloadQueue.filter(item => item.status != 'completed');
        this.downloadManager.pageIndex = 1;
      },
      getFollowingUser() {
        this.followingUser.gettingFollowing = true;
        this.fetchFollowingUser(`https://api.tumblr.com/v2/user/following`).then(({ users, nextPage }) => {
          this.followingUser.userFollowing = users;
          this.followingUser.nextPage = nextPage;
        }).catch(err => console.log('getFollowingUser', err)).then(() => {
          this.followingUser.gettingFollowing = false;
        });
      },
      getFollowingUserNextPage() {
        this.followingUser.gettingFollowing = true;
        this.fetchFollowingUser(this.followingUser.nextPage).then(({ users, nextPage }) => {
          this.followingUser.userFollowing = this.followingUser.userFollowing.concat(users);
          this.followingUser.nextPage = nextPage;
        }).catch(err => console.log('getFollowingUserNextPage', err)).then(() => {
          this.followingUser.gettingFollowing = false;
        });
      },
      fetchFollowingUser(url) {
        return new Promise((resolve, reject) => {
          request.get({
            url,
            oauth: this.getAuthObject(),
            json: true
          }, (error, response, body) => {
            if (error) {
              // error
              reject(error);
              return;
            }
            if (body.errors) {
              // error
              reject(body.errors);
              return;
            }
            function setNextPage(response) {
              if (response.blogs.length <= 0) {
                return false;
              }
              else return `https://api.tumblr.com${response._links.next.href}`;
            }
            body.response.blogs.forEach(blog => (blog.checked = false));

            resolve({
              users: body.response.blogs,
              nextPage: setNextPage(body.response)
            });
          });
        });
      },
      downloadUser(users) {
        this.followingUser.followingUserLoadingDialog = true;
        Promise.all(users.map(user => {
          return this.fetchUserDownloadItem(`https://api.tumblr.com/v2/blog/${user.name}.tumblr.com/posts`).catch(e => {
            e.user_name = user.name;
            return Promise.reject(e);
          }).then(downloadItem => {
            downloadItem.map(item => limit(() => this.addDownloadQueue(item)));
          }).catch(err => {
            this.followingUser.followingUserLoadingDialog = false;
            if (err.user_name) {
              console.log(err.user_name, err);
            } else {
              console.log(err);
            }
          });
        })).then(() => {
          this.followingUser.followingUserLoadingDialog = false;
        });
      },
    },
    watch: {
      activeTab(tab) {
        if (tab === 'favouriteDownload') {
          this.getFavouriteDownload();
        }
        if (tab === 'followingUser') {
          this.getFollowingUser();
        }
      }
    },
  });
});
