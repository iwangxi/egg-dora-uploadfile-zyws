/*
 * @Author: doramart 
 * @Date: 2019-11-20 10:07:42 
 * @Description local 本地，qn 七牛，oss 阿里云oss
 * @Last Modified by: doramart
 * @Last Modified time: 2019-11-21 15:22:32
 */

const qiniu = require("qiniu");
const OSS = require('ali-oss');
const _ = require('lodash');
const awaitWriteStream = require('await-stream-ready').write
const sendToWormhole = require('stream-wormhole')
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const {
    config,
    upload
} = require('../../utils')

// 同步遍历文件
function eachFileSync(dir, findOneFile) {
    const stats = fs.statSync(dir)
    if (stats.isDirectory()) {
        fs.readdirSync(dir).forEach(file => {
            eachFileSync(path.join(dir, file), findOneFile)
        })
    } else {
        findOneFile(dir, stats)
    }
}

// 处理Ueditor上传保存路径
function setFullPath(dest) {
    const date = new Date()

    const map = {
        't': date.getTime(), // 时间戳
        'm': date.getMonth() + 1, // 月份
        'd': date.getDate(), // 日
        'h': date.getHours(), // 时
        'i': date.getMinutes(), // 分
        's': date.getSeconds(), // 秒
    };

    dest = dest.replace(/\{([ymdhis])+\}|\{time\}|\{rand:(\d+)\}/g, function (all, t, r) {
        let v = map[t];
        if (v !== undefined) {
            if (all.length > 1) {
                v = '0' + v
                v = v.substr(v.length - 2)
            }
            return v;
        } else if (t === 'y') {
            return (date.getFullYear() + '').substr(6 - all.length);
        } else if (all === '{time}') {
            return map['t']
        } else if (r >= 0) {
            return Math.random().toString().substr(2, r)
        }
        return all
    });

    return dest
}

// 抓取网络图片
const catchImage = function (url) {
    const request = /^https:\/\//.test(url) ? https.request : http.request
    let image = url.match(/^(:?https?\:)?\/\/[^#?]+/)[0]
    let originalname = image.substr(image.lastIndexOf('\/') + 1)
    let contentType = ''
    let base64Data = ''
    return new Promise((resolve, reject) => {
        const req = request(url, (res) => {
            contentType = res.headers['content-type']
            res.setEncoding('base64')
            res.on('data', (chunk) => {
                base64Data += chunk
            })
            res.on('end', () => resolve({
                contentType,
                base64Data,
                originalname
            }))
        })

        req.on('error', (err) => resolve({
            error: true
        }))
        req.end()
    })
}

// 获取上传配置
async function _getUploadInfoByType(ctx, app) {

    let uploadConfig = await ctx.service.uploadFile.find({
        isPaging: '0'
    });
    let uploadInfo = {};
    if (!_.isEmpty(uploadConfig)) {
        uploadInfo = uploadConfig[0];
    } else {
        // 如果没有，则创建一个本地配置
        uploadInfo = await ctx.service.uploadFile.create({
            type: 'local',
            uploadPath: process.cwd() + '/app/public',
        })
    }
    return uploadInfo;

}

// 上传到七牛云存储
let uploadByQiniu = (readableStream, targetKey, uploadConfigInfo) => {
    return new Promise((resolve, reject) => {
        var config = new qiniu.conf.Config();
        const {
            qn_bucket,
            qn_accessKey,
            qn_secretKey,
            qn_zone,
            qn_endPoint
        } = uploadConfigInfo;
        // 空间对应的机房
        config.zone = qiniu.zone[qn_zone];
        config.useHttpsDomain = true;

        //要上传的空间
        let bucket = qn_bucket;

        var accessKey = qn_accessKey;
        var secretKey = qn_secretKey;
        var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
        var options = {
            scope: bucket + ':' + targetKey,
        };
        var putPolicy = new qiniu.rs.PutPolicy(options);
        var uploadToken = putPolicy.uploadToken(mac);

        var formUploader = new qiniu.form_up.FormUploader(config);
        var putExtra = new qiniu.form_up.PutExtra();

        formUploader.putStream(uploadToken, targetKey, readableStream, putExtra, function (respErr,
            respBody, respInfo) {
            if (respErr) {
                reject(respErr);
            }
            if (respInfo.statusCode == 200) {
                console.log(respBody);
                if (!_.isEmpty(respBody) && qn_endPoint) {
                    resolve(`${qn_endPoint}/${respBody.key}`)
                } else {
                    reject('Upload qiniu failed');
                }
            } else {
                reject('Upload qiniu failed', respBody);
            }
        });

    })
}

// 上传到阿里云oss
let uploadByAliOss = async (stream, targetKey, uploadConfigInfo) => {

    try {
        const {
            oss_bucket,
            oss_accessKey,
            oss_secretKey,
            oss_region,
        } = uploadConfigInfo;
        var clientOss = new OSS({
            region: oss_region,
            bucket: oss_bucket,
            accessKeyId: oss_accessKey,
            accessKeySecret: oss_secretKey
        });

        let result = await clientOss.putStream(targetKey, stream);

        let targetUrl = result.url;
        if (targetUrl.indexOf('http://') >= 0) {
            targetUrl = targetUrl.replace('http://', 'https://');
        }
        return targetUrl;

    } catch (error) {
        throw new Error(error.message);
    }
}

// 上传前获取文件基础信息
let getFileInfoByStream = (ctx, uploadOptions, stream) => {

    const {
        conf,
        uploadType
    } = getUploadConfig(uploadOptions);

    let fileParams = stream.fields;
    let askFileType = fileParams.action || 'uploadimage'; // 默认上传图片

    if (Object.keys(uploadType).includes(askFileType)) {
        const actionName = uploadType[askFileType]
        let pathFormat = setFullPath(conf[actionName + 'PathFormat']).split('/')
        let newFileName = pathFormat.pop()

        let uploadForder = path.join('.', ...pathFormat);
        // 所有表单字段都能通过 `stream.fields` 获取到
        const fileName = path.basename(stream.filename) // 文件名称
        const extname = path.extname(stream.filename).toLowerCase() // 文件扩展名称
        if (!extname) {
            throw new Error(res.__('validate_error_params'));
        }
        // 生成文件名
        // let ms = (new Date()).getTime().toString() + extname;
        return {
            uploadForder,
            uploadFileName: newFileName,
            fileName,
            fileType: extname
        }

    } else {
        throw new Error(ctx.__('validate_error_params'));
    }

}

let getUploadConfig = (userUploadConfig) => {
    const conf = Object.assign({}, config, userUploadConfig || {})
    const uploadType = {
        [conf.imageActionName]: 'image',
        [conf.scrawlActionName]: 'scrawl',
        [conf.catcherActionName]: 'catcher',
        [conf.videoActionName]: 'video',
        [conf.fileActionName]: 'file',
    }
    const listType = {
        [conf.imageManagerActionName]: 'image',
        [conf.fileManagerActionName]: 'file',
    }
    return {
        conf,
        uploadType,
        listType
    }
}

let UploadFileController = {

    /**
     * @api {post} /api/upload/files 文件上传
     * @apiDescription 文件上传，上传用户头像等，限单个文件
     * @apiName /api/upload/files
     * @apiGroup Normal
     * @apiParam {file} file 文件
     * @apiParam {string} action 文件类型 uploadimage:图片  uploadfile:文件
     * @apiParam {string} token 登录时返回的参数鉴权
     * @apiSuccess {json} result
     * @apiSuccessExample {json} Success-Response:
     *{
     *    "status": 200,
     *    "message": "get data success",
     *    "server_time": 1544167579835,
     *    "data": 
     *    {
     *       "path": "http://creatorchain.oss-cn-hongkong.aliyuncs.com/upload/images/img1544167579253.png" // 文件链接
     *    } 
     *}
     * @apiSampleRequest http://localhost:8080/api/upload/files
     * @apiVersion 1.0.0
     */
    async create(ctx, app) {

        try {
            //存放路径
            let options = !_.isEmpty(app.config.doraUploadFile.uploadFileFormat) ? app.config.doraUploadFile.uploadFileFormat : {};

            let uploadPath, returnPath;
            let uploadConfigInfo = await _getUploadInfoByType(ctx, app);
            const stream = await ctx.getFileStream();

            let beforeUploadFileInfo = await getFileInfoByStream(ctx, options, stream);
            let {
                uploadForder,
                uploadFileName
            } = beforeUploadFileInfo;

            if (uploadConfigInfo.type == 'local') {
                const publicDir = options.upload_path || (process.cwd() + '/app/public');
                uploadPath = `${publicDir}/${uploadForder}`
                if (!fs.existsSync(uploadPath)) {
                    fs.mkdirSync(uploadPath);
                }
                const target = path.join(uploadPath, `${uploadFileName}`)
                const writeStream = fs.createWriteStream(target)
                try {
                    await awaitWriteStream(stream.pipe(writeStream))
                } catch (err) {
                    // 必须将上传的文件流消费掉，要不然浏览器响应会卡死
                    await sendToWormhole(stream)
                    throw err
                }
                returnPath = `${app.config.server_path}${app.config.static.prefix}/${uploadForder}/${uploadFileName}`;
            } else if (uploadConfigInfo.type == 'qn') {
                let targetKey = path.join(uploadForder, `${uploadFileName}`)
                returnPath = await uploadByQiniu(stream, targetKey, uploadConfigInfo);
            } else if (uploadConfigInfo.type == 'oss') {
                let targetKey = path.join(uploadForder, `${uploadFileName}`)
                returnPath = await uploadByAliOss(stream, targetKey, uploadConfigInfo);
            }

            // 设置响应内容和响应状态码
            ctx.helper.renderSuccess(ctx, {
                data: {
                    path: returnPath
                }
            });

        } catch (error) {
            ctx.helper.renderFail(ctx, {
                message: error
            });
        }

    },

    // ueditor 上传
    async ueditor(ctx, app, next) {

        try {

            let options = !_.isEmpty(app.config.doraUploadFile.uploadFileFormat) ? app.config.doraUploadFile.uploadFileFormat : {};
            let uploadConfigInfo = await _getUploadInfoByType(ctx, app);
            const publicDir = options.upload_path || (process.cwd() + '/app/public');
            const publicUrlDir = app.config.static.prefix;

            const {
                conf,
                uploadType,
                listType
            } = getUploadConfig(options);

            let result = {}
            let {
                action,
                start = 0
            } = ctx.query
            start = parseInt(start)

            let resInfo = {}
            // 上传文件
            if (Object.keys(uploadType).includes(action)) {
                const actionName = uploadType[action]
                let pathFormat = setFullPath(conf[actionName + 'PathFormat']).split('/')
                let filename = pathFormat.pop()
                try {
                    switch (action) {
                        // 涂鸦类型图片
                        case conf.scrawlActionName:
                            let base64Data = ctx.request.body[conf[actionName + 'FieldName']]
                            let base64Length = base64Data.length
                            if (base64Length - (base64Length / 8) * 2 > conf[actionName + 'MaxSize']) {
                                throw new Error('Picture too big')
                            }
                            ctx.req.file = upload.base64Image(base64Data, publicDir, {
                                destination: path.join(publicDir, ...pathFormat)
                            })

                            resInfo = upload.fileFormat(ctx.req.file)
                            resInfo.url = ctx.protocol + '://' + ctx.host + publicUrlDir + resInfo.url;
                            result = Object.assign({
                                state: 'SUCCESS'
                            }, resInfo)
                            break;
                            // 抓取远程图片
                        case conf.catcherActionName:
                            const sources = ctx.request.body[conf[actionName + 'FieldName']]
                            let list = []
                            let images = []
                            sources.forEach((url) => {
                                images.push(catchImage(url).then((image) => {
                                    if (image.error) {
                                        list.push({
                                            state: 'ERROR',
                                            source: url
                                        })
                                    } else {
                                        let base64Data = image.base64Data
                                        let base64Length = base64Data.length
                                        if (base64Length - (base64Length / 8) * 2 > conf[actionName + 'MaxSize']) {
                                            list.push({
                                                state: 'Picture too big',
                                                source: url
                                            })
                                        } else {
                                            // 重新获取filename
                                            filename = setFullPath(conf[actionName + 'PathFormat']).split('/').pop()
                                            if (filename === '{filename}') {
                                                filename = image.originalname.replace(/\.\w+$/, '')
                                            }
                                            if (/^image\/(\w+)$/.test(image.contentType)) {
                                                base64Data = 'data:' + image.contentType + ';base64,' + base64Data
                                            }
                                            resInfo = upload.fileFormat(
                                                upload.base64Image(base64Data, publicDir, {
                                                    destination: path.join(publicDir, ...pathFormat),
                                                    filename
                                                })
                                            )
                                            resInfo.url = ctx.protocol + '://' + ctx.host + publicUrlDir + resInfo.url;
                                            list.push(Object.assign({
                                                state: 'SUCCESS',
                                                source: url
                                            }, resInfo, {
                                                original: image.originalname
                                            }))
                                        }
                                    }
                                    return image
                                }))
                            })

                            await Promise.all(images)
                            result = {
                                state: 'SUCCESS',
                                list
                            }
                            break;
                            // 表单上传图片、文件
                        default:
                            if (uploadConfigInfo.type == 'oss') {

                                const fileStream = await ctx.getFileStream();
                                let beforeUploadFileInfo = await getFileInfoByStream(ctx, options, fileStream);

                                let {
                                    uploadForder,
                                    uploadFileName
                                } = beforeUploadFileInfo;
                                let targetKey = path.join(uploadForder, `${uploadFileName}`)
                                beforeUploadFileInfo.url = await uploadByAliOss(fileStream, targetKey, uploadConfigInfo);
                                result = Object.assign({
                                    state: 'SUCCESS'
                                }, beforeUploadFileInfo)

                            } else if (uploadConfigInfo.type == 'qn') {

                                const fileStream = await ctx.getFileStream();
                                let beforeUploadFileInfo = await getFileInfoByStream(ctx, options, fileStream);

                                let {
                                    uploadForder,
                                    uploadFileName
                                } = beforeUploadFileInfo;
                                let targetKey = path.join(uploadForder, `${uploadFileName}`)
                                beforeUploadFileInfo.url = await uploadByQiniu(fileStream, targetKey, uploadConfigInfo);
                                result = Object.assign({
                                    state: 'SUCCESS'
                                }, beforeUploadFileInfo)

                            } else {

                                await upload(publicDir, {
                                    storage: upload.diskStorage({
                                        destination: path.join(publicDir, ...pathFormat),
                                        filename(req, file, cb) {
                                            if (filename === '{filename}') {
                                                filename = file.originalname
                                            } else {
                                                filename += upload.getSuffix(file.originalname)
                                            }
                                            cb(null, filename)
                                        }
                                    }),
                                    limits: {
                                        fileSize: conf[actionName + 'MaxSize']
                                    },
                                    allowfiles: conf[actionName + 'AllowFiles']
                                }, options || {}).single(conf[actionName + 'FieldName'])(ctx, next)
                                resInfo = upload.fileFormat(ctx.req.file)
                                resInfo.url = ctx.protocol + '://' + ctx.host + publicUrlDir + resInfo.url;
                                result = Object.assign({
                                    state: 'SUCCESS'
                                }, resInfo)
                            }
                    }
                } catch (err) {
                    result = {
                        state: err.message
                    }
                }
            }
            // 获取图片/文件列表
            else if (Object.keys(listType).includes(action)) {
                const actionName = listType[action]
                let files = []
                eachFileSync(path.join(publicDir, conf[actionName + 'ManagerListPath']), (file, stat) => {
                    if (conf[actionName + 'ManagerAllowFiles'].includes(upload.getSuffix(file))) {
                        const url = file.replace(publicDir, '').replace(/\\/g, '\/')
                        const mtime = stat.mtimeMs
                        files.push({
                            url,
                            mtime
                        })
                    }
                })
                result = {
                    list: files.slice(start, start + conf[actionName + 'ManagerListSize']),
                    start: start,
                    total: files.length,
                    state: 'SUCCESS'
                }
            }
            // 返回Ueditor配置给前端
            else if (action === 'config') {
                result = conf
            } else {
                result = {
                    state: 'FAIL'
                }
            }

            ctx.body = JSON.stringify(result);

        } catch (error) {
            ctx.body = JSON.stringify({
                state: 'FAIL'
            })
        }
    }

}

module.exports = UploadFileController;