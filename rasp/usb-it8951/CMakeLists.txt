cmake_minimum_required(VERSION 3.14)
project(it8951 C)

set(CMAKE_C_STANDARD 99)

add_executable(it8951 main.c)
install(TARGETS it8951 DESTINATION bin)

add_executable(vcom vcom.c)
install(TARGETS vcom DESTINATION bin)
