const AWS = require('aws-sdk');

const s3Client = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS
});

const S3 = {
  async get(fileName, bucket) {
    const params = {
      Bucket: bucket,
      Key: fileName,
      acl: 'public-read-write'
    };

    let data = await s3Client.getObject(params).promise();

    if (!data) {
      throw Error(`Failed to get file ${fileName}, from ${bucket}`);
    }

    if (/\.json$/.test(fileName)) {
      data = JSON.parse(data.Body.toString());
    }
    return data;
  },
  async write(data, key, bucket) {
    const params = {
      Bucket: bucket,
      Body: Buffer.isBuffer(data) ? data : JSON.stringify(data),
      Key: key,
      ACL: 'public-read-write'
    };
    ////console.log('params', params);

    const newData = await s3Client.putObject(params).promise();
    if (!newData) {
      throw Error('there was an error writing the file');
    } else {
      return `https//:${bucket}.s3.eu-west-1.amazonaws.com/${key}`;
    }
  },

  async getSignedURL(bucket, key, expriySeconds) {
    const params = {
      Bucket: bucket,
      Key: key,
      Expires: expriySeconds
    };
    const newData = await s3Client.getSignedUrl('getObject', params);
    if (!newData) {
      throw Error('there was an error writing the file');
    } else {
      return `https://${bucket}.s3.eu-west-1.amazonaws.com/${key}`;
    }
  },

  async delete(bucket, filepath) {
    return s3Client.deleteObject({
      Bucket: bucket,
      Key: filepath
    });
  }
};

module.exports = S3;
