// JetBrains Plugin — Gradle 构建配置 (Kotlin DSL)
// 新架构：Core 接口由 Kotlin 端重新定义（因为跨语言无法共享 TS 接口）
// GitHub Provider 在此项目中实现
// ============================================================

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.22"
    id("org.jetbrains.intellij") version "1.17.2"
}

group = "com.gitpilot"
version = "1.0.0"

repositories { mavenCentral() }

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib")
    // HTTP 客户端（GitHub API）
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")
    // 协程
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.7.3")
    // 测试
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.1")
}

intellij {
    version.set("2023.3")
    type.set("IC")
    plugins.set(listOf("Git4Idea", "com.intellij.java", "org.jetbrains.kotlin"))
}

tasks {
    withType<JavaCompile> { sourceCompatibility = "17"; targetCompatibility = "17" }
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions { jvmTarget = "17" }
    }
    patchPluginXml {
        sinceBuild.set("233"); untilBuild.set("242.*")
    }
}
