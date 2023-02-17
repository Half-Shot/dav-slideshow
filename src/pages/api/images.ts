import { XMLParser } from 'fast-xml-parser';
import type { NextApiRequest, NextApiResponse } from 'next'
import nextcloudClient, { Album } from '../../ncClient';
import { createHash } from 'node:crypto';
import { ErrorResponse, ImagesApiResponse } from '@/api';

interface PropStat {
  'd:prop': Record<string, unknown>,
  'd:status': string,
}

interface PropStatResponse {
  'd:href': string,
  'd:propstat': PropStat[],
}

interface GetAlbumResponse {
  'd:multistatus': {
    'd:response': PropStatResponse[],
  }
}



export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ImagesApiResponse[]|ErrorResponse>
) {
    /**
     * Dear reader, the WebDAV API is utterly awful to anyone with a scrap of sanity. I don't know if this is unique to
     * (Next|Own)Cloud, but it's seriously awful.
     */
    return nextcloudClient.request({
        data: `<?xml version=\"1.0\"?>
                <d:propfind xmlns:d=\"DAV:\" xmlns:oc=\"http://owncloud.org/ns\" xmlns:nc=\"http://nextcloud.org/ns\" xmlns:ocs=\"http://open-collaboration-services.org/ns\">
                <d:prop>
                    <d:getcontenttype />
                </d:prop>
            </d:propfind>`,
        method: "PROPFIND"
    }).then(response => {
        if (response.status === 404) {
            // Album doesn't exist
            res.status(404).json({error: `Album '${Album}' could not be found`});
            return;
        }
        // Nextcloud returns multiple statuses when it finds an Album.
        if (response.status !== 207) {
            // Album doesn't exist
            res.status(500).json({error: `Unknown response from DAV server`});
            return;
        }
        const data: GetAlbumResponse = new XMLParser({
            isArray: tagName => ['d:response', 'd:propstat'].includes(tagName)
        }).parse(response.data);
        const innerResponse = data['d:multistatus']['d:response'];
        // If the album doesn't have any content, this is instead a single response (object)
        if (innerResponse.length === 1) {
            const innerStatus = innerResponse[0]['d:propstat'][0]['d:status'];
            if (innerStatus.endsWith(' 404 Not Found')) {
                // No images in album.
                res.status(404).json({error: `Album '${Album}' contains no images.`});
            } else {
                res.status(500).json({error: `Unexpected error fetching the album images.`});
            }
            return;
        }
        // d:response is an array of responses when the album has content.
        const images = innerResponse.filter(item => {
            const props = Array.isArray(item['d:propstat']) ? item["d:propstat"][0]["d:prop"] : item["d:propstat"]["d:prop"];
            const contentType = props["d:getcontenttype"] as string|undefined;
            return !!contentType?.startsWith("image/");
        });
        const urls = images.map(imgData => {
            const imgName = imgData['d:href'].split('/').pop();
            return {
                img: `/api/image/${imgName}`,
                exif: `/api/exif/${imgName}`,
            }
        });
        const hashUrls = createHash('md5').update(urls.join(',')).digest().toString('hex');
        res.setHeader('ETag', hashUrls);
        res.status(200).json(urls);
    }).catch((ex) => {
        console.error(`Failed to list images from dav`, ex);
        res.status(500).json({error: "Failed to make request"});
    });
}