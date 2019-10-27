const path = require('path');

module.exports = {
    mode: 'development',
    stats: 'verbose',
    entry: './src/js/tabs/receiver_calibration.tsx',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                exclude: /\.module\.css$/,
                use: [
                    'style-loader',
                    {
                        loader: 'typings-for-css-modules-loader',
                        options: {
                            modules: true,
                            namedExport: true
                        }
                    }
                ]
            },
            {
                test: /\.module\.css$/,
                use: [
                    'style-loader',
                    {
                        loader: 'typings-for-css-modules-loader',
                        options: {
                            modules: true,
                            namedExport: true
                        }
                    }
                ]
            },
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', ".js", ".css"]
    },
    output: {
        filename: 'receiver_calibration.js',
        path: path.resolve(__dirname, 'dist/js/tabs')
    },
    devtool: 'inline-source-map',
};
