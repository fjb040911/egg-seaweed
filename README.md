# egg-seaweedfs
这是一个封装了操作SeaweedFS RESF API接口的 node.js 库，可直接适用于egg.js

# 什么是 SeaweedFS?

[SeaweedFS](https://github.com/chrislusf/seaweedfs) 是一个高可用可扩展的分布式文件系统，号称存储10亿文件还能提供快速服务

# 开始使用
* 拷贝 seaweed.js 到 app/service 目录下
* config.default.js 中做如下配置
```javascript
config.weed = {
  server: '127.0.0.1',
  port: 9333,
  masters: [
    {
      host: '127.0.0.1',
      port: 9333,
    },
  ],
  scheme: 'http',
};
```

# 基本使用
```javascript
const result = await this.ctx.service.write("./file.png");
```


# API

## write(file(s), [{opts}])

存储文件.  返回 Promise，返回值中可以取到文件的存储信息

在分布式的场景中，配置项 <code>{opts}</code> 中可用来定义文件的复制策略:

```javascript
const result = await ctx.service.write("./file.png", {replication: 000});
```

也可以直接传入一个 buffer 或者 stream:
```javascript
// 直接传入Buffer类型
const result = await ctx.service.write(new Buffer("a buffer"))

//直接传入Stream类型
const result = await ctx.service.write(getYourStream())
```

也支持多个文件同时写入， 这种模式只会返回一个fid，每个文件的实际fid将是 <code>fid_${index}<code> 的方式:
```javascript
const result = await ctx.service.write(["./fileA.jpg", "./fileB.jpg"])
const fileAFid = result.fid
const fileBFid = result.fid + "_1"
```
多文件同时传输时候，path，buffer，stream都能被同时支持

## read(fileId, [stream])

传入一个 fid ,返回文件的 Buffer:
```javascript
const fileBuffer = await ctx.service.read(fileId);
```

## find(file)

搜索文件在集群中的位置.
```javascript
const locations =  await ctx.service.find(fileId);
```

## remove(file)

在集群中所有节点删除一个文件.
```javascript
ctx.service.remove(fileId);
```

## masterStatus()

返回 master 节点的状态信息。 返回 leader 节点信息和 master 服务的可用状态

```javascript
const status = await ctx.service.masterStatus();
```

## systemStatus()

获取master服务信息和当前的可用存储拓扑信息.

```javascript
const status = await ctx.service.systemStatus();
```

## status(host)

获取单个 volume server 的信息.

```javascript
const status = await ctx.service.status("127.0.0.1:8080");
```

## vacuum(opts)

强行回收 volume servers 的垃圾

```javascript
const status = await ctx.service.vacuum({garbageThreshold: 0.4});
```
