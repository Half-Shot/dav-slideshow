'use client';
import styles from './page.module.scss'
import { useEffect, useMemo, useRef, useState } from 'react';
import { GridLoader } from 'react-spinners';
import * as luxon from 'luxon';
import { Bebas_Neue } from '@next/font/google'
import { useSearchParams } from 'next/navigation';
import { ExifApiResponse, ImagesApiResponse } from '@/api';

const fontStyle = Bebas_Neue({ weight: "400", subsets: ["latin"] });

function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const RECHECK_INTERVAL_MS = 60000;


export default function Home() {
    const [images, setImages] = useState<ImagesApiResponse[]|null>(null);
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
        const abortionController = new AbortController();
        const fetchNewImages = async () => {
            try {
                const req = await fetch("/api/images", { signal: abortionController.signal });
                const newETag = req.headers.get('ETag') ?? "";
                console.debug(`Fetched new images from:${ETag} to:${newETag}`);
                if (ETag === newETag) {
                    // Same content, ignore.
                    return false;
                }
                console.log('Album was updated, fetching data');
                const data = await req.json();
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
                setETag(newETag);
            } catch (ex) {

                if (abortionController.signal.aborted) {
                    // We explicitly aborted it, that's fine
                    return;
                }
                if (!images) {
                    console.log("Fatal error", ex);
                    setLoadError('Could not load album');
                } else {
                    // We've already got some images, this is not fatal.
                    console.log("Warning, could not fetch images", ex);
                }
            }
        };

        fetchNewImages();

        const t = setTimeout(() => {
            console.log("Refetching Album");
            fetchNewImages();
        }, RECHECK_INTERVAL_MS);
        return () => {
            abortionController.abort();
            clearTimeout(t);
        };
    });

    // When a new image is selected, fetch it.
    useEffect(() => {
        if (!images || !preloadImageRef.current) {
            return;
        }

        const nextImage = images[imageIndex];

        // Load the image into the browser in an invisible element to force a load.
        preloadImageRef.current.addEventListener("load", () => {
            console.log("Preloaded image loaded, fetching exif");
            fetch(nextImage.exif).then(req => req.json() as ExifApiResponse).then(data => {
                setExifData({
                    CreateDate: data.date && luxon.DateTime.fromObject(data.date),
                });
            }).catch(ex => {
                setExifData(null);
                console.log("Couldn't load exif data", ex);
            }).finally(() => {
                setCurrentImageSrc(nextImage.img);
            })
        }, { once: true });
        preloadImageRef.current.src = nextImage.img;
    }, [imageIndex, images]);

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
    }, [imageIndex, intervalMs, images]);

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
        <img ref={preloadImageRef} alt="" width="0px"/>
        {currentImageSrc && <div className={styles.blur} style={{"background": `url(${currentImageSrc})`}}>
        </div>}
        {currentImageSrc && <img className={styles.image} src={currentImageSrc} alt="Slideshow image"></img>}
        {exifData && <div className={styles.infobox}>
            {currentTime && <p className={styles.time}>
                {currentTime.time}
                <span className={styles.date}>{currentTime.date}</span>
            </p>}
            {exifData.CreateDate && <p className='takenDate'>Taken on {exifData.CreateDate?.toLocaleString(luxon.DateTime.DATE_FULL)}</p>}
        </div>}
    </main>;
}
