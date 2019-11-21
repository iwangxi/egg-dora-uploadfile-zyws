module.exports = app => {
    const mongoose = app.mongoose
    var shortid = require('shortid');
    var path = require('path');
    var Schema = mongoose.Schema;
    var moment = require('moment')

    var UploadFileSchema = new Schema({
        _id: {
            type: String,
            'default': shortid.generate
        },
        createTime: {
            type: Date,
        },
        updateTime: {
            type: Date,
        },
        type: {
            type: String,
            emun: ['local', 'qn', 'oss']
        }, // 上传方式 
        uploadPath: String, // 本地上传路径
        qn_bucket: String,
        qn_accessKey: String,
        qn_secretKey: String,
        qn_zone: String,
        qn_endPoint: String,
        oss_bucket: String,
        oss_accessKey: String,
        oss_secretKey: String,
        oss_region: String,
        oss_endPoint: String,
        oss_apiVersion: String,

    });

    UploadFileSchema.set('toJSON', {
        getters: true,
        virtuals: true
    });
    UploadFileSchema.set('toObject', {
        getters: true,
        virtuals: true
    });

    UploadFileSchema.path('createTime').get(function (v) {
        return moment(v).format("YYYY-MM-DD HH:mm:ss");
    });
    UploadFileSchema.path('updateTime').get(function (v) {
        return moment(v).format("YYYY-MM-DD HH:mm:ss");
    });

    return mongoose.model("UploadFile", UploadFileSchema, 'uploadfiles');

}