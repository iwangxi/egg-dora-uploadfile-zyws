const _ = require('lodash');
const uploadFileAdminController = require('../controller/manage/uploadFile')
const uploadFileApiController = require('../controller/api/uploadFile')

module.exports = (options, app) => {

    return async function uploadFileRouter(ctx, next) {

        Object.assign(app.config.doraUploadFile, options);
        let pluginConfig = app.config.doraUploadFile;
        await app.initPluginRouter(ctx, pluginConfig, uploadFileAdminController, uploadFileApiController, next);
        if (ctx.originalUrl.indexOf('/api/upload/ueditor') < 0) {
            await next();
        }

    }

}