'use client';
import styles from './page.module.scss'
import { useEffect, useMemo, useRef, useState } from 'react';
import { GridLoader } from 'react-spinners';
import exifr from 'exifr';
import * as luxon from 'luxon';
import { Bebas_Neue } from '@next/font/google'
import { useSearchParams } from 'next/navigation';

const fontStyle = Bebas_Neue({ weight: "400", subsets: ["latin"] });

function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function parseDateTimeFromExif(data: {306: string, CreateDate: Date}): luxon.DateTime|undefined {
    let dt: luxon.DateTime|undefined;
    if (data.CreateDate) {
        dt = luxon.DateTime.fromJSDate(data.CreateDate);
    }
    else if (data["306"]) {
        // The only source I can find on this format is https://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf.
        dt = luxon.DateTime.fromFormat(data["306"], 'yyyy:LL:dd HH:mm:ss')
    }
    return dt?.invalidReason === null ? dt : undefined;
}

const RECHECK_INTERVAL_MS = 60000;


export default function Home() {
    const [images, setImages] = useState<string[]|null>(null);
    const [imageIndex, setImageIndex] = useState<number>(-1);
    const [currentImageSrc, setCurrentImageSrc] = useState<string|null>(null);
    const [exifData, setExifData] = useState<{CreateDate?: luxon.DateTime}|null>();
    const [loadError, setLoadError] = useState<string|null>(null);
    const [ETag, setETag] = useState<string>("");
    const [currentTime, setCurrentTime] = useState<{date: string, time: string, minute: number}|null>();
    const preloadImageRef = useRef<HTMLImageElement>(null);
    const params = useSearchParams();
    const intervalMs = useMemo(() => parseInt(params.get('interval_ms') ?? '15000'), [params]);

    useEffect(() => {
        const fetchNewImages = () => fetch("/api/images").then(r => {
            const newETag = r.headers.get('ETag') ?? "";
            if (ETag === newETag) {
                // Same content, ignore.
                return false;
            }
            console.log('Album was updated');
            setETag(newETag);
            return r.json();
        }).then(data => {
            if (!data) {
                return;
            }
            if (data.error) {
                setLoadError(data.error);
                return;
            }
            if (data.length === 0) {
                setLoadError('Your album contains no images');
                return;
            }
            setImages(shuffle(data));
            setImageIndex(0);
        }).catch(ex => {
            if (!images) {
                console.log("Fatal error", ex);
                setLoadError('Could not load album');
            } else {
                // We've already got some images, this is not fatal.
                console.log("Warning, could not fetch images", ex);
            }
        });

        fetchNewImages();

        const t = setTimeout(() => {
            console.log("Refetching Album");
            fetchNewImages();
        }, RECHECK_INTERVAL_MS);
        return () => clearTimeout(t);
    }, []);

    // When a new image is selected, fetch it.
    useEffect(() => {
        if (!images || !preloadImageRef.current) {
            return;
        }

        const nextImage = images[imageIndex];

        // Load the image into the browser in an invisible element to force a load.
        preloadImageRef.current.addEventListener("load", () => {
            exifr.parse(preloadImageRef.current!).then(data => {
                setExifData({
                    CreateDate: parseDateTimeFromExif(data),
                });
            }).catch(ex => {
                setExifData(null);
                console.log("Couldn't load exif data", ex);
            }).finally(() => {
                setCurrentImageSrc(nextImage);
            })
        }, { once: true });
        preloadImageRef.current.src = nextImage;
    }, [imageIndex]);

    // Periodically rotate the image
    useEffect(() => {
        if (!intervalMs) {
            return;
        }
        const t = setTimeout(() => {
            if (!images) {
                throw Error(`Expected images to be defined, this is FATAL.`);
            }
            const nextIndex = imageIndex + 1;
            setImageIndex(nextIndex < images.length ? nextIndex : 0);
        }, intervalMs);
        return () => clearTimeout(t);
    }, [imageIndex, intervalMs]);

    useEffect(() => {
        const t = setInterval(() => {
            const now = luxon.DateTime.now();
            if (currentTime?.minute !== now.minute) {
                setCurrentTime({
                    date: now.toFormat('DD'),
                    time: now.toFormat('t'),
                    minute: now.minute,
                });
            }
        }, 1000);
        return () => clearInterval(t);
    })

    return <main className={[styles.main,fontStyle.className].join(' ')}>
        {!currentImageSrc && <div className={styles.loader}>
            <GridLoader color="#ffffff" speedMultiplier={loadError ? 0.1 : 1} />
            {loadError && <p>{loadError}</p>}
        </div>}
        <img ref={preloadImageRef} width="0px"/>
        {currentImageSrc && <div className={styles.blur} style={{"background": `url(${currentImageSrc})`}}>
        </div>}
        {currentImageSrc && <img className={styles.image} src={currentImageSrc}></img>}
        {exifData && <div className={styles.infobox}>
            {currentTime && <p className={styles.time}>
                {currentTime.time}
                <span className={styles.date}>{currentTime.date}</span>
            </p>}
            {exifData.CreateDate && <p className='takenDate'>Taken on {exifData.CreateDate?.toLocaleString(luxon.DateTime.DATE_FULL)}</p>}
        </div>}
    </main>;
}
