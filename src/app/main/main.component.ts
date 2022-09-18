import { AfterViewChecked, AfterViewInit, Component, OnInit } from '@angular/core';

import * as seedrandom from "seedrandom"
import { newPlot, Data, Layout, Config } from "plotly.js-dist-min"
import { probit } from "simple-statistics"
import { FormField } from '../components/form/form.component';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { WasmService } from '../wasm.service';
import { ActivatedRoute } from '@angular/router';
import { definedOr } from '../utils/defined-or';

class MatrixObject {
    data: Float64Array;
    rows: number;
    cols: number;

    constructor(data: Float64Array, rows: number, cols: number) {
        this.data = data;
        this.rows = rows;
        this.cols = cols;
    }

    static rand(rows: number, cols: number, randFn = Math.random) {
        const newData = new Float64Array(rows * cols);
        for (let i = 0; i < rows * cols; ++i) {
            newData[i] = randFn();
        }

        return new MatrixObject(newData, rows, cols);
    }

    static add(a: MatrixObject, b: MatrixObject) {
        if (a.rows != b.rows || a.cols != b.cols) {
            throw "Rows and cols must be the same";
        }

        const newData = new Float64Array(a.rows * a.cols);
        for (let i = 0; i < a.rows * a.cols; ++i) {
            newData[i] = a.data[i] + b.data[i];
        }

        return new MatrixObject(newData, a.rows, a.cols);
    }

    static range(start: number, end: number, step: number) {
        const length = Math.floor((end - start) / step) + 1;
        const newData = new Float64Array(length);
        newData[0] = start;
        for (let i = 1; i < length; ++i) {
            newData[i] = newData[i - 1] + step;
        }

        return new MatrixObject(newData, length, 1);
    }

    apply(fn: (x: number) => number): MatrixObject {
        const newData = new Float64Array(this.data.length);

        for (let i = 0; i < this.data.length; ++i) {
            newData[i] = fn(this.data[i]);
        }

        return new MatrixObject(newData, this.rows, this.cols);
    }

    getCol(rowNum: number) {
        (window as any).test = this;
        return new Float64Array(this.data.buffer, rowNum * this.rows * 8, this.rows);
    }

    static ref(a: MatrixObject) {
        return new MatrixObject(a.data, a.rows, a.cols);
    }
}

class Example {
    X: MatrixObject;
    y: MatrixObject;

    xSampleMin: number;
    xSampleMax: number;

    xPredictMin: number;
    xPredictMax: number;

    Xt: MatrixObject;
    yt: MatrixObject;

    rng: seedrandom.PRNG;
    yNoiseStd: number;

    constructor(xRange: [number, number], xtRange: [number, number], fn: (x: number) => number, randomX = false, yNoiseStd = 0.0, numPredictions = 10, numXSamples = 10) {
        this.xSampleMin = xRange[0];
        this.xSampleMax = xRange[1];

        this.xPredictMin = xtRange[0];
        this.xPredictMax = xtRange[1];

        this.rng = seedrandom(new Date().getTime().toString());

        this.Xt = MatrixObject.range(xtRange[0], xtRange[1], (xtRange[1] - xtRange[0]) / (numPredictions - 1));
        this.X = MatrixObject.range(xRange[0], xRange[1], (xRange[1] - xRange[0]) / (numXSamples - 1));
        this.yt = this.Xt.apply(fn);

        this.yNoiseStd = yNoiseStd;

        if (randomX) {
            this.X = MatrixObject.rand(this.X.rows, this.X.cols, () => {
                const max = xRange[0];
                const min = xRange[1];
                return this.rng() * (max - min) + min;
            });
        }

        const noise = MatrixObject.rand(this.X.rows, 1, () => yNoiseStd * probit(this.rng()));

        this.y = MatrixObject.add(noise, this.X.apply(fn));
    }

    async predict(wasm: WasmService, v = 1, l = 1, s: number | null = 0, m: number | null = null): Promise<[MatrixObject, MatrixObject, MatrixObject]> {
        if (m === null) {
            m = -1;
        }

        if (s === null) {
            s = this.yNoiseStd;
        }


        const module: any = await wasm.getModule();
        const grTest = module.gr(this.X, this.y, this.Xt, v, l, s, m);

        return [grTest.mean, grTest.covariance, grTest.variance];
    }

    async takeSamples(wasm: WasmService, numDraws: number, resolution: number, v = 1, l = 1, s: number | null = 0, m: number | null = null): Promise<[MatrixObject, MatrixObject]> {
        if (m === null) {
            m = -1;
        }

        if (s === null) {
            s = this.yNoiseStd;
        }

        const Xd = MatrixObject.range(this.xPredictMin, this.xPredictMax, (this.xPredictMax - this.xPredictMin) / resolution);

        const module: any = await wasm.getModule();
        const draws = module.sampleFromGr(numDraws, this.X, this.y, Xd, v, l, s, m);


        const res = MatrixObject.ref(draws);
        return [Xd, res];
    }

    async takeStdSamples(wasm: WasmService, numDraws: number, numDims: number): Promise<MatrixObject> {
        const module: any = await wasm.getModule();
        const draws = module.getStdProcess(numDraws, numDims);

        return draws;
    }
}

interface ExampleParams {
    name: string
    xRange: [number, number],
    xtRange: [number, number],
    fn: (x: number) => number
}

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit, AfterViewInit {
    DEFAULTS = {
        SPLINE_SMOOTHING: 0,
        RESOLUTION: 200,
        FUNCTION_SAMPLE_RESOLUTION: 100,
        FUNCTION: +definedOr(this.route.snapshot.queryParamMap.get("fn_n"), "0"),
        NUM_SAMPLES: +definedOr(this.route.snapshot.queryParamMap.get("num_samples"), "8"),
        NUM_FN_SAMPLES: +definedOr(this.route.snapshot.queryParamMap.get("num_fn_samples"), "20"),
        NUM_STD_GP_SAMPLES: +definedOr(this.route.snapshot.queryParamMap.get("num_std_gp_samples"), "2"),
        SAMPLE_METHOD: +definedOr(this.route.snapshot.queryParamMap.get("sample_method"), "0"),
        YNOISE: +definedOr(this.route.snapshot.queryParamMap.get("y_noise"), "0.1"),
        PRIOR_MEAN: "",
        PRIOR_DATASET_NOISE: "",
        LENGTH_SCALE_FACTOR: +definedOr(this.route.snapshot.queryParamMap.get("length_scale_factor"), "1"),
        VERTICAL_SCALE_FACTOR: +definedOr(this.route.snapshot.queryParamMap.get("vertical_scale_factor"), "1")
    }


    // if x range max - min < 0.5, the function sample graph wont show the range
    exampleParams: ExampleParams[] = [
        {
            name: "sin(x)",
            xRange: [-Math.PI, Math.PI],
            xtRange: [-4 * Math.PI, 4 * Math.PI],
            fn: v => Math.sin(v),
        }, {
            name: "exp(cos(x)) sin(x)",
            xRange: [0, 10],
            xtRange: [-2, 12],
            fn: x => Math.exp(Math.cos(x)) * Math.sin(x),
        }, {
            name: "Normal distribution PDF",
            xRange: [-5, 5],
            xtRange: [-5, 5],
            fn: x => 1.0 / Math.sqrt(2 * Math.PI) * Math.exp(-0.5 * x ** 2),
        }, {
            name: "Sigmoid function",
            xRange: [-5, 5],
            xtRange: [-10, 10],
            fn: x => 1.0 / (1 + Math.exp(-x)),
        }, {
            name: "Point",
            xRange: [-0.05, 0.05],
            xtRange: [-4, 4],
            fn: x => x,
        }
    ];

    hiddenExampleStartIndex: number = 4;


    protected sampleConfig: FormField[] = [
        {
            name: "function",
            label: "Choose Function",
            controlOptions: [this.DEFAULTS.FUNCTION, [Validators.required]],
            invalidFeedback: "Required",
            type: "select",
            selectOptions: this.exampleParams.filter((v, i) => i < this.hiddenExampleStartIndex).map(v => v.name),
            hidden: !!this.route.snapshot.queryParamMap.get("fn_n_hidden")
        },
        {
            name: "numSamples",
            label: "Number of samples",
            controlOptions: [this.DEFAULTS.NUM_SAMPLES, [Validators.required]],
            invalidFeedback: "Must be in the range [1, 50]",
            type: "number",
            numberMin: 1,
            numberStep: 1,
            numberMax: 50,
            hidden: !!this.route.snapshot.queryParamMap.get("num_samples_hidden")
        },
        {
            name: "sampleMethod",
            label: "Sample Method",
            controlOptions: [this.DEFAULTS.SAMPLE_METHOD, [Validators.required]],
            invalidFeedback: "Required",
            type: "select",
            selectOptions: ["Systematic", "Random"],
            hidden: !!this.route.snapshot.queryParamMap.get("sample_method_hidden")
        },
        {
            name: "yNoise",
            label: "Sample noise",
            controlOptions: [this.DEFAULTS.YNOISE, [Validators.required]],
            invalidFeedback: "Must be in the range [0, 5]",
            type: "number",
            defaultCheckbox: {
                label: "No noise",
                checked: this.DEFAULTS.YNOISE === 0,
                engageOverwriteValue: 0.0
            },
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5,
            hidden: !!this.route.snapshot.queryParamMap.get("y_noise_hidden")
        }
    ]

    protected paramConfig: FormField[] = [
        {
            name: "m",
            label: "Prior mean",
            controlOptions: [this.DEFAULTS.PRIOR_MEAN, []],
            invalidFeedback: "Required",
            type: "number",
            defaultCheckbox: {
                label: "Use average from samples",
                checked: true,
                engageOverwriteValue: "",
                disengageOverwriteValue: 0.0
            },
            numberStep: 0.5,
            hidden: !!this.route.snapshot.queryParamMap.get("prior_mean_hidden")
        },
        {
            name: "s",
            label: "Prior noise",
            controlOptions: [this.DEFAULTS.PRIOR_DATASET_NOISE, []],
            invalidFeedback: "Must be in the range [0, 5]",
            type: "number",
            defaultCheckbox: {
                label: "Match with sample noise",
                checked: true,
                engageOverwriteValue: "",
                disengageOverwriteValue: this.DEFAULTS.YNOISE
            },
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5,
            hidden: !!this.route.snapshot.queryParamMap.get("prior_std_hidden")
        },
        {
            name: "l",
            label: "Length scale",
            controlOptions: [this.DEFAULTS.LENGTH_SCALE_FACTOR, Validators.required],
            invalidFeedback: "Must be in the range [1, 5]",
            type: "number",
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5,
            hidden: !!this.route.snapshot.queryParamMap.get("length_scale_factor_hidden")
        },
        {
            name: "v",
            label: "Vertical scale",
            controlOptions: [this.DEFAULTS.VERTICAL_SCALE_FACTOR, Validators.required],
            invalidFeedback: "Must be in the range [1, 5]",
            type: "number",
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5,
            hidden: !!this.route.snapshot.queryParamMap.get("vertical_scale_factor_hidden")
        }
    ];

    protected redrawSamplesFormInput: FormField[] = [
        {
            name: "numFnSamples",
            label: "Samples",
            controlOptions: [this.DEFAULTS.NUM_FN_SAMPLES, [Validators.required]],
            type: "number",
            invalidFeedback: "Must be in the range [1, 50]",
            numberMin: 1,
            numberMax: 50,
            numberStep: 1
        }
    ];

    protected redrawStdGPSamplesFormInput: FormField[] = [
        {
            name: "numFnSamples",
            label: "Samples",
            controlOptions: [this.DEFAULTS.NUM_STD_GP_SAMPLES, [Validators.required]],
            type: "number",
            invalidFeedback: "Must be in the range [1, 50]",
            numberMin: 1,
            numberMax: 50,
            numberStep: 1
        }
    ];

    protected formLayout: number[] = [1, 3, 4];

    protected currentExample: Example;
    protected currentHPs: [number, number, number | null, number | null] = [this.DEFAULTS.VERTICAL_SCALE_FACTOR, this.DEFAULTS.LENGTH_SCALE_FACTOR, this.DEFAULTS.PRIOR_DATASET_NOISE === "" ? null : this.DEFAULTS.PRIOR_DATASET_NOISE as unknown as number, this.DEFAULTS.PRIOR_MEAN === "" ? -1 : this.DEFAULTS.PRIOR_MEAN as unknown as number];
    protected currentExampleParams: ExampleParams | null = null;

    constructor(private wasm: WasmService, protected route: ActivatedRoute) {
        this.currentExampleParams = this.exampleParams[this.DEFAULTS.FUNCTION];

        this.currentExample = new Example(
            this.currentExampleParams.xRange,
            this.currentExampleParams.xtRange,
            this.currentExampleParams.fn,
            this.DEFAULTS.SAMPLE_METHOD == 1,
            this.DEFAULTS.YNOISE,
            this.DEFAULTS.RESOLUTION,
            this.DEFAULTS.NUM_SAMPLES
        )
    }

    ngAfterViewInit(): void {
        this.currentExample.predict(this.wasm, ...this.currentHPs).then(prediction => {
            this.drawExample(this.currentExample as Example, prediction);
        }).then(() => {
            this.displaySamples();
            this.displayStdGP();
        });
    }

    drawExample(theExample: Example, prediction: [MatrixObject, MatrixObject, MatrixObject]) {
        const samples: Data = {
            x: theExample.X.data,
            y: theExample.y.data,
            mode: "markers",
            marker: {
                color: "#000",
                symbol: "x"
            },
            name: "Samples"
        };

        const trueFn: Data = {
            x: theExample.Xt.data,
            y: theExample.yt.data,
            mode: "lines",
            line: {
                color: "#F00A",
                shape: "spline",
                smoothing: this.DEFAULTS.SPLINE_SMOOTHING
            },
            name: "True function"
        };


        const predictedMean: Data = {
            x: theExample.Xt.data,
            y: prediction[0].data,
            mode: "lines",
            line: {
                color: "#00FA",
                smoothing: this.DEFAULTS.SPLINE_SMOOTHING,
                shape: "spline"
            },
            name: "Maximum a posteriori estimate"
        };

        const confidenceIntervalTop: Data = {
            x: theExample.Xt.data,
            y: prediction[2].data.map((v, i) => prediction[0].data[i] + 1.96 * v ** 0.5),
            mode: "lines",
            line: {
                color: "#00F3",
                smoothing: this.DEFAULTS.SPLINE_SMOOTHING,
                shape: "spline"
            },
            legendgroup: "fill",
            showlegend: false
        };

        const confidenceIntervalBottom: Data = {
            x: theExample.Xt.data,
            y: prediction[2].data.map((v, i) => prediction[0].data[i] - 1.96 * v ** 0.5),
            mode: "lines",
            line: {
                color: "#00F3",
                smoothing: this.DEFAULTS.SPLINE_SMOOTHING,
                shape: "spline"
            },
            fill: "tonexty",
            fillcolor: "#00F1",
            legendgroup: "fill",
            name: "95% confidence interval"
        };

        const layout: Partial<Layout> = {
            title: "Gaussian Regression",
            shapes: [{
                type: "rect",
                yref: "paper",
                xref: "x",
                x0: theExample.xSampleMin,
                x1: theExample.xSampleMax,
                y0: 0,
                y1: 1,
                fillcolor: "#F001",
                line: {
                    width: 0
                }
            }],
            margin: {
                pad: 0,
                b: 0,
                l: 0,
                r: 0,
            },
            hovermode: false,
            legend: {
                yanchor: "top",
                xanchor: "left",
                x: 0.01,
                y: 0.99,
                orientation: "h",
                bgcolor: "#FFFA"
            },
            paper_bgcolor: "#FFF0",
            plot_bgcolor: "#FFF0"
        };

        const config: Partial<Config> = {
            displaylogo: false,

        }

        const a = newPlot("chart", [samples, trueFn, predictedMean, confidenceIntervalTop, confidenceIntervalBottom], layout, config);
    }

    drawSamples(example: Example, samples: [MatrixObject, MatrixObject]) {
        const pltData: Data[] = [];

        for (let i = 0; i < samples[1].cols; ++i) {
            pltData.push({
                x: samples[0].data,
                y: samples[1].getCol(i),
                mode: "lines",
                line: {
                    color: `hsl(calc(0 + (0.2 - 0) * ${(i + 1) / (samples[1].cols)}), 100%, 50%)`,
                    smoothing: 1.3, // always as smooth as possible
                    shape: "spline"
                },
                opacity: 0.3 + 1.0 / samples[1].cols,
                name: `Sample ${i + 1}`,
                showlegend: false
            });

        }

        const layout: Partial<Layout> = {
            title: "Samples of Gaussian Process",
            shapes: example.xSampleMax - example.xSampleMin > 0.5 ? [
                {
                    type: "rect",
                    yref: "paper",
                    xref: "x",
                    x0: example.X.data[0],
                    x1: example.X.data[example.X.data.length - 1],
                    y0: 0,
                    y1: 1,
                    fillcolor: "#F001",
                    line: {
                        width: 0
                    }
                }
            ] : [],
            margin: {
                pad: 0,
                b: 0,
                l: 0,
                r: 0,
            },
            hovermode: false,
            paper_bgcolor: "#FFF0",
            plot_bgcolor: "#FFF0"
        };

        const config: Partial<Config> = {
            displaylogo: false
        };

        const a = newPlot("chart-2", pltData, layout, config);
    }

    async displaySamples(ctrl: FormGroup | null = null) {
        if (!!this.route.snapshot.queryParamMap.get("display_samples_hidden")) {
            return;
        }

        const res = await this.currentExample.takeSamples(this.wasm, ctrl ? +ctrl.get("numFnSamples")!.value : this.DEFAULTS.NUM_FN_SAMPLES, this.DEFAULTS.FUNCTION_SAMPLE_RESOLUTION, ...this.currentHPs);
        this.drawSamples(this.currentExample, res);
    }

    async displayStdGP(ctrl: FormGroup | null = null) {
        const numFnSamples = ctrl ? +ctrl.get("numFnSamples")!.value : this.DEFAULTS.NUM_STD_GP_SAMPLES;

        if (!!this.route.snapshot.queryParamMap.get("std_gp_hidden")) {
            return;
        }

        const module: any = await this.wasm.getModule();
        const samples: MatrixObject = MatrixObject.ref(module.getStdGProcess(numFnSamples, this.DEFAULTS.FUNCTION_SAMPLE_RESOLUTION));

        const pltData: Data[] = [];


        for (let i = 0; i < samples.cols; ++i) {
            pltData.push({
                x: MatrixObject.range(-1, 1, 2.0 / this.DEFAULTS.FUNCTION_SAMPLE_RESOLUTION).data,
                y: samples.getCol(i),
                mode: "lines",
                line: {
                    color: `hsl(calc(0 + (0.2 - 0) * ${(i + 1) / (samples.cols)}), 100%, 50%)`
                },
                opacity: 0.3 + 1.0 / samples.cols,
                name: `Sample ${i + 1}`,
                showlegend: false
            });
        }

        const layout: Partial<Layout> = {
            title: "Samples of Gaussian Process",
            margin: {
                pad: 0,
                b: 0,
                l: 0,
                r: 0
            },
            hovermode: false,
            paper_bgcolor: "#FFF0",
            plot_bgcolor: "#FFF0"
        };

        const config: Partial<Config> = {
            displaylogo: false
        };

        const a = newPlot("chart-3", pltData, layout, config)
    }

    ngOnInit(): void {
    }

    protected onSampleConfigChange(ctrl: FormControl) {
        if (ctrl.invalid) {
            return;
        }

        const theFunc = ctrl.get("function")!.value;

        this.currentExampleParams = this.exampleParams[theFunc];

        this.currentExample = new Example(
            this.currentExampleParams.xRange,
            this.currentExampleParams.xtRange,
            this.currentExampleParams.fn,
            ctrl.get("sampleMethod")!.value == 1,
            +ctrl.get("yNoise")!.value,
            this.DEFAULTS.RESOLUTION,
            +Math.floor(ctrl.get("numSamples")!.value)
        )

        this.currentExample.predict(this.wasm, ...this.currentHPs).then(prediction => {
            this.drawExample(this.currentExample as Example, prediction);
        });

    }

    protected onHPConfigChange(ctrl: FormControl) {
        this.currentHPs = [+ctrl.get("v")!.value, +ctrl.get("l")!.value, ctrl.get("s")!.value === "" ? null : +ctrl.get("s")!.value, ctrl.get("m")!.value === "" ? null : +ctrl.get("m")!.value]
        this.currentExample.predict(this.wasm, ...this.currentHPs).then(prediction => {
            this.drawExample(this.currentExample as Example, prediction);
        });
    }
}
