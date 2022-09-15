#if __INTELLISENSE__
#undef __ARM_NEON
#undef __ARM_NEON__
#endif

#include <cmath>
#include <eigen3/Eigen/Dense>
#include <iostream>

namespace Math
{
    class GR
    {
    private:
        const Eigen::MatrixXd X;
        const Eigen::VectorXd y;

        const double v, l, s, m;

        const Eigen::VectorXd yDemeaned;
        const Eigen::MatrixXd K1;
        const Eigen::MatrixXd S1;
        const Eigen::MatrixXd K1S1Inv;
        const Eigen::VectorXd K1S1InvTimesYDemeaned;

        Eigen::MatrixXd kernel(Eigen::MatrixXd A, Eigen::MatrixXd B)
        {
            return std::pow(v, 2) * (squared_norm(A, B) * (-0.5 / std::pow(l, 2))).array().exp().matrix();
        }

        Eigen::MatrixXd squared_norm(Eigen::MatrixXd A, Eigen::MatrixXd B)
        {
            Eigen::MatrixXd res = Eigen::MatrixXd::Zero(A.rows(), B.rows());
            for (size_t i = 0; i < A.rows(); ++i)
            {
                for (size_t j = 0; j < B.rows(); ++j)
                {
                    res(i, j) = std::pow((A.row(i) - B.row(j)).norm(), 2.0);
                }
            }

            return res;
        }

    public:
        GR(Eigen::MatrixXd X, Eigen::VectorXd y, double v, double l, double s, double m = -1) : X(X), y(y), v(v), l(l), s(s), m(m == -1 ? y.mean() : m), yDemeaned(y.array() - this->m), K1(kernel(X, X)), S1((std::pow(s, 2.0) + 1e-6) * Eigen::MatrixXd::Identity(X.rows(), X.rows())), K1S1Inv((K1 + S1).inverse()), K1S1InvTimesYDemeaned(K1S1Inv * yDemeaned)
        {
            std::cout << this->m << std::endl;
        }

        std::pair<Eigen::VectorXd, Eigen::MatrixXd> predict(Eigen::MatrixXd Xt)
        {
            const auto K2 = kernel(X, Xt);
            const auto K3 = K2.transpose();
            const auto K4 = kernel(Xt, Xt);

            const auto posteriorMean = ((K3 * K1S1InvTimesYDemeaned).array() + m).matrix();
            const auto posteriorCovariance = K4 - K3 * K1S1Inv * K2;

            return std::make_pair(posteriorMean, posteriorCovariance);
        }
    };
}