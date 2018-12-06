const request = require('request');
const storage = require('electron-json-storage');
const { app } = require('electron').remote;
const { shell, ipcRenderer } = require('electron');
const qs = require('querystring');



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
  new Vue({
    el: '#app',
    data() {
      return {
        activeTab: firstRun.isFirstRun === false ? 'userDownload' : 'settings',
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
        },
        userDownload: {
          userDownloadUrlInput: '',
          gettingUserDownloadImages: false,
          userImages: [],
          userDownloadTypeSelectOptions: {
            'photo': '图片',
            'video': '影片'
          },
          userDownloadTypeSelect: 'photo',
          downloadAll: false,
          nextPage: false,
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
        },
      }
    },
    computed: {
      userDownloadAllChecked() {
        return this.userDownload.userImages.length > 0 && this.userDownload.userImages.every(img => img.checked);
      },
      favouriteDownloadAllChecked() {
        return this.favouriteDownload.favouriteImages.length > 0 && this.favouriteDownload.favouriteImages.every(img => img.checked);
      }
    },
    created() {
      ipcRenderer.on('loginCallback', (event, data) => {
        this.loginCallback(data);
      });
      if (this.user.key) {
        this.getUserInfo();
      }
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
        let matchResult = this.userDownload.userDownloadUrlInput.match(/(^https?:\/\/)?(?<id>\w+)(\.tumblr\.com\/?)?$/i);
        let userId = '';
        if (matchResult && matchResult.groups.id) {
          userId = matchResult.groups.id;
        }
        if (!userId || userId == '') {
          // userInput wrong
          return;
        }
        this.userDownload.gettingUserDownloadImages = true;

        return this.fetchUserPics(`https://api.tumblr.com/v2/blog/${userId}.tumblr.com/posts/${this.userDownload.userDownloadTypeSelect}`).then(({ userImages, nextPage }) => {
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
        }).catch(console.log).then(() => {
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
            if (body.errors) {
              // error
              reject(body.errors);
              return;
            }
            console.log(body);

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
                downloadItems.push({
                  thumbnail: photo.original_size.url,
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
              downloadItems.push({
                thumbnail: post.thumbnail_url,
                src: post.video_url,
                summary: post.summary,
                date: post.date,
                post_url: post.post_url,
                key: `${post.reblog_key}`,
                checked: false,
              });
            }
            case 'text': {
              let $nodes = $($.parseHTML(post.body));
              let imgSet = [].slice.call($nodes.find('img'));

              imgSet.forEach((img, index) => {
                let src = img.src.replace('_540', '_1280');
                downloadItems.push({
                  thumbnail: src,
                  src: src,
                  summary: '',
                  date: post.date,
                  post_url: post.post_url,
                  key: `${post.reblog_key}_img_${index}`,
                  checked: false,
                });
              });

              let videoSet = [].slice.call($nodes.find('video'));
              videoSet.forEach((video, index) => {
                downloadItems.push({
                  thumbnail: video.poster,
                  src: video.currentSrc,
                  summary: '',
                  date: post.date,
                  post_url: post.post_url,
                  key: `${post.reblog_key}_video_${index}`,
                  checked: false,
                });
              })
            }
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
        let downloadItem = [];
        if (this.userDownload.downloadAll) {
          let { userImages, nextPage } = await this.fetchUserPics(`https://api.tumblr.com/v2/blog/${userId}.tumblr.com/posts/${this.userDownload.userDownloadTypeSelect}`);
          downloadItem = userImages;
          while (nextPage != false) {
            let { userImages: a, nextPage: b } = await this.fetchUserPics(nextPage);
            downloadItem = downloadItem.concat(a);
            nextPage = b;
          }
        } else {
          downloadItem = this.userDownload.userImages.filter(value => value.checked);
        }
        console.log(downloadItem);
      },
      favouriteDownloadCheckAll($event) {
        this.favouriteDownload.favouriteImages.forEach(img => (img.checked = $event));
      },
      showSaveDialog() {
        let { dialog, getCurrentWindow } = require('electron').remote;
        dialog.showOpenDialog(getCurrentWindow(), {
          properties: ['openDirectory']
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
          oauth: this.getAuthObject()
        }, (e, r, body) => {
          let auth_request = qs.parse(body);
          let redirect_url = `https://www.tumblr.com/oauth/authorize?${qs.stringify({ oauth_token: auth_request.oauth_token })}`;
          this.settingPage.auth_request = auth_request;
          shell.openExternal(redirect_url);
          this.generatingLoginPage = false;
        });
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
            console.log(body);
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
        let downloadItem = [];
        if (this.favouriteDownload.downloadAll) {
          let { favouriteImages, nextPage } = await this.fetchFavouriteDownload(`https://api.tumblr.com/v2/user/likes`);
          downloadItem = favouriteImages;
          while (nextPage != false) {
            let { favouriteImages: a, nextPage: b } = await this.fetchFavouriteDownload(nextPage);
            downloadItem = downloadItem.concat(a);
            nextPage = b;
          }
        } else {
          downloadItem = this.favouriteDownload.favouriteImages.filter(value => value.checked);
        }
        console.log(downloadItem);
      },
      setNextPageFavouriteDownload(response) {
        if (response.liked_posts.length <= 0) {
          return false;
        }
        else return `https://api.tumblr.com${response._links.next.href}`;
      },
    },
    watch: {
      activeTab(tab) {
        if (tab === 'favouriteDownload') {
          this.getFavouriteDownload();
        }
      }
    },
  });
});
