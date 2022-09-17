cmake_minimum_required(VERSION 3.0.0)
project(gr VERSION 0.1.0)

add_executable(gr src/cpp/gr.cpp)
include_directories("/opt/homebrew/include/" "/opt/homebrew/Cellar/emscripten/3.1.21/libexec/cache/sysroot/include/")
target_link_libraries(gr embind)

set_target_properties(gr PROPERTIES LINK_FLAGS "-s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=0 -s ENVIRONMENT='web'")

set(CPACK_PROJECT_NAME ${PROJECT_NAME})
set(CPACK_PROJECT_VERSION ${PROJECT_VERSION})
include(CPack)
