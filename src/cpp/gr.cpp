#include "math.cpp"
#include <emscripten/bind.h>
#include <iostream>
#include <string>

namespace em = emscripten;

struct MatrixObject
{
    em::val data;
    size_t rows, cols;
};

struct GRResult
{
    MatrixObject mean;
    MatrixObject covariance;
    MatrixObject variance;
};

template <class T>
T matrixFromJSVal(const MatrixObject &mat)
{
    const auto length = mat.data["length"].as<size_t>();
    assert(length == mat.cols * mat.rows);
    T res(mat.rows, mat.cols);

    const em::val memoryView{em::typed_memory_view(length, res.data())};
    memoryView.call<void>("set", mat.data);
    return res;
}

// template <class T>
MatrixObject matrixToJSVal(const Eigen::MatrixXd &mat)
{
    size_t length = mat.rows() * mat.cols();
    // auto data = em
    auto data = em::val::global("Float64Array").new_(length);
    const em::val memoryView{em::typed_memory_view(length, mat.data())};
    data.call<void>("set", memoryView);

    return {data, static_cast<size_t>(mat.rows()), static_cast<size_t>(mat.cols())};
}

GRResult gr(const MatrixObject &xIn, const MatrixObject &yIn, const MatrixObject &xtIn, double v = 1.0, double l = 1.0, double s = -1, double m = -1)
{
    const auto x = matrixFromJSVal<Eigen::MatrixXd>(xIn);
    const auto y = matrixFromJSVal<Eigen::VectorXd>(yIn);

    const auto xt = matrixFromJSVal<Eigen::MatrixXd>(xtIn);

    // construct the math class
    Math::GR regression(x, y, v, l, s, m);

    const auto res = regression.predict(xt);
    return {matrixToJSVal(res.first), matrixToJSVal(res.second), matrixToJSVal(res.second.diagonal())};
}

EMSCRIPTEN_BINDINGS(my_module)
{
    em::value_object<MatrixObject>("MatrixObject")
        .field("data", &MatrixObject::data)
        .field("rows", &MatrixObject::rows)
        .field("cols", &MatrixObject::cols);

    em::value_object<GRResult>("GRResult")
        .field("mean", &GRResult::mean)
        .field("covariance", &GRResult::covariance)
        .field("variance", &GRResult::variance);

    em::function("gr", &gr);
}