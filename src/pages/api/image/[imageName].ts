import type { NextApiRequest, NextApiResponse } from 'next'
import { Readable } from 'stream';
import nextcloudClient from '../../../ncClient';

export const config = {
    api: {
        responseLimit: false,
    },
}

async function tryTranscode(stream: Readable, sourceImageKind: string, acceptsHeader?: string): Promise<[Readable, string]> {
    let sharpFn: typeof import("sharp");
    try {
        sharpFn = require('sharp');
    } catch (ex) {
        console.log('Could not load sharp, not transcoding:', ex);
        // Could not import, just return
        return [stream, sourceImageKind];
    }
    const browserWebPPriority = acceptsHeader?.indexOf('image/webp') ?? -1;
    const browserSourcePriority = acceptsHeader?.indexOf(sourceImageKind) ?? -1;
    // Slightly cheeky, the brower MIGHT want the source image type more.
    if (browserWebPPriority === -1 || browserWebPPriority <= browserSourcePriority) {
        // If the browser priorities the source imae kind more (or it's also a webp image)
        // just return the stream.
        console.log(`Browser rejected encoding, priority webp was ${browserWebPPriority} over ${browserSourcePriority}`);
        console.log("Accept:", acceptsHeader);
        return [stream, sourceImageKind];
    }

    // Let's transcode
    const bufs: Buffer[] = [];
    stream.on('data', function(d){ bufs.push(d as Buffer); });
    return new Promise((resolve, reject) => {
        stream.on('end', function(){
            try {
                console.log('Loaded all buffer components, transcoding');
                resolve([
                    sharpFn(Buffer.concat(bufs)).webp(),
                    'image/webp'
                ]);
            } catch (ex) {
                reject(ex)
            }
        });
    });
}
  

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
    const { imageName } = req.query;

    if (typeof imageName !== "string") {
        return res.status(400).send({error: "Invalid request"});
    }
    return nextcloudClient.request({
      url: `/${imageName}`,
      method: 'GET',
      responseEncoding: 'binary',
      responseType: 'stream',
    }).then(response => {
        const contentType = response.headers['content-type'];
        if (typeof contentType !== "string") {
            throw Error(`Server provided an invalid Content-Type of '${contentType}'`);
        }
        res.setHeader('Cache-Control', 'public, max-age=600, immutable');

        // Should we attempt to transcode
        return tryTranscode(response.data as Readable, contentType, req.headers['accept']).then(([resultStream, resultType]) => {
            res.status(200);
            res.setHeader('Content-Type', resultType);
            resultStream.pipe(res);
        });
    }).catch(ex => {
        console.error(`Failed to get image from dav`, ex);
        res.status(500).json({error: "Failed to make request"});
    });
}