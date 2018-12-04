const API_KEY = 'ttWKklONSmaevIswNp4iyA4gsgzCUYrkCXfAAYRMk8faoiRVYG';

const request = require('request');

new Vue({
  el: '#app',
  data() {
    return {
      activeTab: 'favouriteDownload',
      userDownloadUrlInput: '',
      gettingUserDownloadImages: false,
      userImages: [],
      userDownloadTypeSelect: 'photo'
    }
  },
  methods: {
    handleTabClick(tab, event) {

    },
    getUserPics() {
      let matchResult = this.userDownloadUrlInput.match(/(^https?:\/\/)?(?<id>\w+)(\.tumblr\.com)?$/i);
      let userId = '';
      if (matchResult && matchResult.groups.id) {
        userId = matchResult.groups.id;
      }
      if (!userId || userId == '') {
        // userInput wrong
        return;
      }
      this.gettingUserDownloadImages = true;
      request.get({
        url: `https://api.tumblr.com/v2/blog/${userId}.tumblr.com/posts/${this.userDownloadTypeSelect}?api_key=${API_KEY}`,
        json: true
      }, (error, response, body) => {
        if (error) {
          // error
          return;
        }
        if (body.errors) {
          // error
          return;
        }
        let userImages = [];
        console.log(body);
        body.response.posts.forEach(post => {
          post.photos.forEach(photo => {
            userImages.push({
              src: photo.original_size.url,
              summary: post.summary,
              date: post.date,
              post_url: post.post_url
            });
          });
        });
        console.log(userImages);
        this.userImages = userImages;
        this.gettingUserDownloadImages = false;
      });
    },
  }
});