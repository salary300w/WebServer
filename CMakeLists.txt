# 设置 CMake 的最低版本要求
cmake_minimum_required(VERSION 3.10)

# 设置项目名称
project(WebServer)

# 定义源文件变量
set(SOURCE_FILES 
            main.cpp
            config.cpp
            webserver.cpp
            )

# 设置库名称
set(libname httplib
            loglib
            timerlib
            )

# 添加可执行文件及其源文件
add_executable(${PROJECT_NAME} ${SOURCE_FILES})

target_link_libraries(${PROJECT_NAME} ${libname} pthread)
# 添加子目录，进入到 utils 目录下执行其 CMakeLists.txt
add_subdirectory(http)
add_subdirectory(lock)
add_subdirectory(log)
add_subdirectory(threadpool)
add_subdirectory(timer)

# 将 include 目录添加到包含路径中
target_include_directories(${PROJECT_NAME} PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})