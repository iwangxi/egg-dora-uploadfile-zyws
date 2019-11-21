'use strict'

/**
 * egg-dora-uploadfile default config
 * @member Config#eggDoraUploadFile
 * @property {String} SOME_KEY - some description
 */

const pkgInfo = require('../package.json');
exports.doraUploadFile = {
    alias: 'uploadFile', // 插件目录，必须为英文
    pkgName: 'egg-dora-uploadfile', // 插件包名
    enName: 'doraUploadFile', // 插件名
    name: '文件上传', // 插件名称
    description: '文件上传', // 插件描述
    isadm: 1, // 是否有后台管理，1：有，0：没有，入口地址:'/ext/devteam/admin/index'
    isindex: 0, // 是否需要前台访问，1：需要，0：不需要,入口地址:'/ext/devteam/index/index'
    version: pkgInfo.version, // 版本号
    iconName: 'icon_service', // 主菜单图标名称
    adminUrl: 'https://cdn.html-js.cn/cms/plugins/static/admin/uploadFile/js/app.js',
    adminApi: [{
        url: 'uploadFile/getList',
        method: 'get',
        controllerName: 'list',
        details: '获取文件上传列表',
    }, {
        url: 'uploadFile/getOne',
        method: 'get',
        controllerName: 'getOne',
        details: '获取单条文件上传信息',
    }, {
        url: 'uploadFile/addOne',
        method: 'post',
        controllerName: 'create',
        details: '添加单个文件上传',
    }, {
        url: 'uploadFile/updateOne',
        method: 'post',
        controllerName: 'update',
        details: '更新文件上传信息',
    }, {
        url: 'uploadFile/delete',
        method: 'get',
        controllerName: 'removes',
        details: '删除文件上传',
    }],
    fontApi: [{
        url: 'upload/files',
        method: 'post',
        controllerName: 'create',
        details: '文件上传',
    }, {
        url: 'upload/ueditor',
        method: 'get',
        controllerName: 'ueditor',
        details: '文件上传初始化配置',
    }, {
        url: 'upload/ueditor',
        method: 'post',
        controllerName: 'ueditor',
        details: '文件上传',
    }],

    initData: '', // 初始化数据脚本
    pluginsConfig: ` 
    exports.doraUploadFile = {\n
        enable: true,\n
         \n
    };\n
    `, // 插入到 plugins.js 中的配置
    defaultConfig: `
    uploadFileRouter:{\n
        match: [ctx => ctx.path.startsWith('/manage/uploadFile'), ctx => ctx.path.startsWith('/api/upload')],\n
    },\n
    `, // 插入到 config.default.js 中的配置
}