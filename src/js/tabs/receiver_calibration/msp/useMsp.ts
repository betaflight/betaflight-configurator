import {useEffect, useState} from "react";

export default function useMsp(key: string) {
    useEffect(() => {
        window.parent.postMessage({
            type: 'msp_get',
            payload: {
                key
            }
        }, "*")
    }, []);

    useEffect(() => {
        window.addEventListener("message", handleDataUpdate, false);

        return () => window.removeEventListener("message", handleDataUpdate, false);
    });

    const [data, setData] = useState();

    const handleDataUpdate = ({data: {type, payload}}: {data: any}) => {
        if (type === 'msp_get' && payload.key === key) {
            // payload.data
        }
        // TODO Process data
        // Check for presence of key
        setData(data);
    };

    return [data, (data: any) => {
        window.parent.postMessage({
            type: 'msp_set',
            payload: {
                key,
                data
            }
        }, "*")
    }]
}
