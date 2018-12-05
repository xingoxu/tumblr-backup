const API_KEY = 'ttWKklONSmaevIswNp4iyA4gsgzCUYrkCXfAAYRMk8faoiRVYG';
const API_Secret = 'HuHQ3aMQNtzceOMKRiMcpMLMJ0lci0aplmgA6D1LGvBLcoVAsG';

const request = require('request');

new Vue({
  el: '#app',
  data() {
    return {
      activeTab: 'settings',
      user: {
        key: undefined,
        secret: undefined,
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
      settings: {
        savePath: '',
      },
    }
  },
  computed: {
    userDownloadAllChecked() {
      return this.userDownload.userImages.length > 0 && this.userDownload.userImages.every(img => img.checked);
    }
  },
  methods: {
    handleTabClick(tab, event) {

    },
    getAuthObject() {
      if (this.user.key) {
        return {
          consumer_key: API_KEY,
          consumer_secret: API_Secret,
          token: this.user.key,
          token_secret: this.user.secret
        }
      } else {
        return {
          consumer_key: API_KEY,
          consumer_secret: API_Secret
        }
      }
    },
    getUserPics() {
      let matchResult = this.userDownload.userDownloadUrlInput.match(/(^https?:\/\/)?(?<id>\w+)(\.tumblr\.com)?$/i);
      let userId = '';
      if (matchResult && matchResult.groups.id) {
        userId = matchResult.groups.id;
      }
      if (!userId || userId == '') {
        // userInput wrong
        return;
      }
      this.userDownload.gettingUserDownloadImages = true;

      return this.fetchUserPics(`https://api.tumblr.com/v2/blog/${userId}.tumblr.com/posts/${this.userDownload.userDownloadTypeSelect}`).then(({userImages, nextPage}) => {
        this.userDownload.userImages = userImages;
        this.userDownload.nextPage = nextPage; 
      }).catch(error => {

      }).then(() => {
        this.userDownload.gettingUserDownloadImages = false;
      });
    },
    getUserPicsNextPage() {
      this.userDownload.gettingUserDownloadImages = true;
      return this.fetchUserPics(this.userDownload.nextPage).then(({userImages, nextPage}) => {
        this.userDownload.userImages = this.userDownload.userImages.concat(userImages);
        this.userDownload.nextPage = nextPage; 
      }).catch(error => {

      }).then(() => {
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
          console.log(body.response);

          resolve({
            userImages: this.setUserImageUserDownload(body.response),
            nextPage: this.setNextPageUserDownload(body.response)
          });
        });
      });
    },
    setUserImageUserDownload(response) {
      let userImages = [];
      response.posts.forEach(post => {
        post.photos.forEach((photo, index) => {
          userImages.push({
            src: photo.original_size.url,
            summary: post.summary,
            date: post.date,
            post_url: post.post_url,
            key: `${post.reblog_key}_${index}`,
            checked: false,
          });
        });
      });
      return userImages;
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
    showSaveDialog() {
      console.log('test');
      let { dialog, getCurrentWindow } = require('electron').remote;
      dialog.showOpenDialog(getCurrentWindow(), {
        properties: ['openDirectory']
      }, filePaths => {
        console.log(filePaths);
      });
    }
  }
});