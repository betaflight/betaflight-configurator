import {useState, useEffect} from "react";
import useInterval from "../hooks/useInterval";

function parseRc(data: any): number[] {
    const noOfChannels = data.byteLength / 2;
    return [...Array(noOfChannels).keys()]
        .map(idx => data.getUint8(idx * 2) + data.getUint8((idx * 2) + 1) * 256)
}

function parseRxrangeConfig(data: any): number[][] {
    const noOfChannels = data.byteLength / 4;
    return [...Array(noOfChannels).keys()]
        .map(idx => [
                data.getUint8(idx * 2) + data.getUint8((idx * 2) + 1) * 256,
                data.getUint8(idx * 2) + data.getUint8((idx * 2) + 1) * 256,
            ]
        );

    const rxRangeChannelCount = data.byteLength / 4;
    for (var i = 0; i < rxRangeChannelCount; i++) {
        RXRANGE_CONFIG.push({
            min: data.readU16(),
            max: data.readU16()
        });
    }

    return data
}

function parseMspData(data: any, code: number): any {
    return {
        [MSPCodes.MSP_RC]: parseRc,
        [MSPCodes.MSP_RXRANGE_CONFIG]: parseRxrangeConfig,
    }[code](data)
}

export function useMsp(code: number): any {
    const [response, setResponse] = useState(null);

    useEffect(() => {
        MSP.send_message(code, null, null, ({data}: {data: any}) =>
            setResponse(parseMspData(data, code))
        );
    }, []);

    return response;
}

export function useMspPolling(code: number, interval: number): any {
    const [response, setResponse] = useState(null);

    useInterval(() => {
        MSP.send_message(code, null, null, ({data}: {data: any}) =>
            setResponse(parseMspData(data, code))
        );
    }, interval);

    return response;
}
