import {useState, useEffect} from "react";
import useInterval from "../hooks/useInterval";

function parseRc(data: any) {
    const noOfChannels = data.byteLength / 2;
    return [...Array(noOfChannels).keys()]
        .map(idx => data.getUint8(idx * 2) + data.getUint8((idx * 2) + 1) * 256)
}

function parseMspData(data: any, code: number): object {
    return {
        [MSPCodes.MSP_RC]: parseRc
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
