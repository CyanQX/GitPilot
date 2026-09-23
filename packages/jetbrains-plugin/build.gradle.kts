// JetBrains Plugin — Gradle build configuration (Kotlin DSL)
// New architecture: Core interfaces are redefined on the Kotlin side
// (TS interfaces cannot be shared across languages).
// The GitHub Provider is implemented in this project.
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
    // HTTP client (GitHub API)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.7.3")
    // Testing
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
