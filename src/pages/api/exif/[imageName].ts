import type { NextApiRequest, NextApiResponse } from 'next'
import nextcloudClient from '../../../ncClient';
import { Exifr } from 'exifr';
import * as luxon from 'luxon';
import { ErrorResponse, ExifApiResponse } from '@/api';

function parseDateTimeFromExif(data: {306: string, CreateDate: Date}): luxon.DateTime|undefined {
    let dt: luxon.DateTime|undefined;
    if (data.CreateDate) {
        dt = luxon.DateTime.fromJSDate(data.CreateDate);
    }
    else if (data["306"]) {
        // Sourced from https://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf.
        dt = luxon.DateTime.fromFormat(data["306"], 'yyyy:LL:dd HH:mm:ss')
    }
    return dt?.invalidReason === null ? dt : undefined;
}


export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ExifApiResponse|ErrorResponse>,
) {
    const { imageName } = req.query;

    if (typeof imageName !== "string") {
        return res.status(400).send({error: "Invalid request"});
    }
    const exifr = new Exifr();
    return nextcloudClient.request({
      url: `/${imageName}`,
      method: 'GET',
      responseEncoding: 'binary',
      responseType: 'arraybuffer',
    }).then(response => {
        res.setHeader('Cache-Control', 'public, max-age=600, immutable');
        return exifr.read(response.data);

    }).then(() => {
        return exifr.parse();
    }).then(exifrData=> {
        const date = parseDateTimeFromExif(exifrData);
        res.json({
            date: date?.toObject(),
        });
    }).catch(ex => {
        console.error(`Failed to get exif data from dav`, ex);
        res.status(500).json({error: "Failed to make request"});
    });
}