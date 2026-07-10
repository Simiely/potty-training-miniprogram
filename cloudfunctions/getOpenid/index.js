// 云函数 getOpenid - 返回当前用户的 openid
// 部署后客户端通过 wx.cloud.callFunction({ name: 'getOpenid' }) 调用
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
  };
};
