import type { NextApiRequest, NextApiResponse } from 'next'
import nextcloudClient from './ncClient';

export const config = {
    api: {
        responseLimit: false,
    },
}
  

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
    const { img } = req.query;

    if (typeof img !== "string") {
        return res.status(400).send({error: "Invalid request"});
    }
    return nextcloudClient.request({
      url: `/${img}`,
      method: 'GET',
      responseType: 'stream',
    }).then(response => {
        res.status(200);
        if (response.headers['Content-Length'] !== undefined) {
            res.setHeader('Content-Length', response.headers['Content-Length'] as number);
        }
        if (response.headers['Content-Type'] !== undefined) {
            res.setHeader('Content-Length', response.headers['Content-Type'] as string);
        }
        res.setHeader('Cache-Control', 'public, max-age=600, immutable');
        response.data.pipe(res);
    }).catch(ex => {
        console.error(`Failed to get image from dav`, ex);
        res.status(500).json({error: "Failed to make request"});
    });
}